"""Readiness and stable input fingerprints. Reconstruction snapshots never include derived outputs."""
import hashlib
import json

from sqlalchemy import select
from app.models import (Actor, ActorLink, Camera, ClockRecord, EvidenceFile, ModelRun, ProcessingJob, ReconstructionScenario,
                        SensorSource, SourceAnnotation, SourceEvent, SyncEdge, VehicleTrack, Witness, WitnessClaim, WitnessStatement)


def inputs(db, case_id):
    evidence = list(db.scalars(select(EvidenceFile).where(EvidenceFile.case_id == case_id)))
    actors = list(db.scalars(select(Actor).where(Actor.case_id == case_id)))
    witnesses = list(db.scalars(select(Witness).where(Witness.case_id == case_id)))
    statements = list(db.scalars(select(WitnessStatement).where(WitnessStatement.witness_id.in_([w.id for w in witnesses]))))
    by_case = [Camera, ModelRun, ProcessingJob, SensorSource, SourceEvent, ClockRecord, SyncEdge]
    rows = evidence + actors + witnesses + statements
    for model in by_case:
        rows += list(db.scalars(select(model).where(model.case_id == case_id)))
    for model in (SourceAnnotation, VehicleTrack):
        rows += list(db.scalars(select(model).where(model.evidence_id.in_([e.id for e in evidence]))))
    rows += list(db.scalars(select(ActorLink).where(ActorLink.actor_id.in_([a.id for a in actors]))))
    rows += list(db.scalars(select(WitnessClaim).where(WitnessClaim.statement_id.in_([s.id for s in statements]))))
    return rows


def fingerprint(db, case_id):
    rows = inputs(db, case_id)
    # Column attributes include the mapped Python name (VehicleTrack.class_name rather than SQL class).
    records = [(r.__tablename__, {a.key: getattr(r, a.key) for a in r.__mapper__.column_attrs}) for r in rows]
    encoded = sorted(json.dumps(r, sort_keys=True, default=str) for r in records)
    return hashlib.sha256(json.dumps(encoded).encode()).hexdigest()


def status(db, case_id):
    rows = inputs(db, case_id)
    of = lambda model: [r for r in rows if isinstance(r, model)]
    evs, jobs = of(EvidenceFile), of(ProcessingJob)
    statements, claims = of(WitnessStatement), [c for c in of(WitnessClaim) if (c.normalized or {}).get("review_status") != "excluded"]
    # Readiness describes the latest successful runs, just like the UI and reconstruction.
    runs = sorted([r for r in of(ModelRun) if r.status in ('completed', 'partially_completed')], key=lambda r: str(r.finished_at or ''), reverse=True)
    latest_track = {}
    latest_claim = {}
    for run in runs:
        if run.stage == 'track':
            latest_track.setdefault(run.input_sha256, run.id)
        elif run.stage == 'extract_claims':
            for c in claims:
                if c.model_run_id == run.id:
                    latest_claim.setdefault(c.statement_id, run.id)
    claims = [c for c in claims if not c.model_run_id or latest_claim.get(c.statement_id) == c.model_run_id]
    sources = of(SensorSource)
    track_runs = set(latest_track.values())
    tracks = [t for t in of(VehicleTrack) if t.model_run_id in track_runs]
    links = [l for l in of(ActorLink) if l.status == 'confirmed']
    active = [j for j in jobs if j.status in ('pending', 'validating', 'processing')]
    # Only the newest attempt per evidence/stage matters for failed-stage notices.
    latest = {}
    for j in sorted(jobs, key=lambda j: (j.created_at, j.id)):
        latest[(j.evidence_id, j.stage)] = j
    failed = [j for j in latest.values() if j.status == 'failed']
    unmapped = [e.id for e in evs if e.kind == 'sensor_csv' and e.id not in {s.evidence_id for s in sources}]
    missing_claims = [s.id for s in statements if s.id not in {c.statement_id for c in claims}]
    unlinked_claims = [c.id for c in claims if not any(l.ref_type == 'claim' and l.ref_id == c.id for l in links)]
    valid = [e for e in evs if e.status == 'valid']
    media = [e for e in valid if e.kind in ('cctv', 'dashcam', 'sensor_csv')]
    # The shared sync API applies the same declared clocks and offsets as reconstruction.
    from app.services import sync
    from app.services.sources import annotation_edges
    clocks = [{k: getattr(c, k) for k in ('evidence_id', 'utc_zero', 'bound_ms', 'basis')} for c in of(ClockRecord)]
    edges = [{k: getattr(e, k) for k in ('id', 'a_evidence', 'b_evidence', 'offset_ms', 'bound_ms', 'basis', 'status')} for e in of(SyncEdge)]
    edges += annotation_edges([{k: getattr(a, k) for k in ('evidence_id', 'clock_offset_ms', 'clock_offset_reference_id')} for a in of(SourceAnnotation) if a.clock_offset_reference_id])
    solved = sync.solve([{'id': e.id, 'kind': e.kind} for e in media], clocks, edges)
    can_build = bool(valid) and not active and bool(of(SourceEvent) or claims)
    checks = [
        {'label': 'Evidence processing', 'ready': bool(valid) and not active and not failed, 'detail': f'{len(active)} processing · {len(failed)} failed', 'section': 'sources'},
        {'label': 'Witness claims', 'ready': not missing_claims, 'detail': f'{len(claims)} claims · {len(missing_claims)} statements need review', 'section': 'witnesses'},
        {'label': 'Sensor columns', 'ready': not unmapped, 'detail': f'{len(unmapped)} files need mapping', 'section': 'sources'},
        {'label': 'Shared clock', 'ready': not solved['unsynchronized'] and not solved['inconsistencies'] and len(solved['groups']) <= 1, 'detail': f"{len(solved['unsynchronized'])} unaligned sources · {len(solved['groups'])} clock groups", 'section': 'sources'},
        {'label': 'Vehicle matching', 'ready': not unlinked_claims and (not tracks or any(l.ref_type == 'track' and l.ref_id in {t.id for t in tracks} for l in links)) and all(any(l.ref_type == 'sensor_source' and l.ref_id == s.id for l in links) for s in sources),
         'detail': f'{len(unlinked_claims)} unmatched claims · {sum(not any(l.ref_type == "track" and l.ref_id == t.id for l in links) for t in tracks)} unmatched tracks', 'section': 'matching'},
    ]
    scn = db.scalars(select(ReconstructionScenario).where(ReconstructionScenario.case_id == case_id, ReconstructionScenario.is_baseline.is_(True)).order_by(ReconstructionScenario.created_at.desc())).first()
    current = fingerprint(db, case_id)
    saved = (scn.assumptions or {}).get('input_fingerprint') if scn else None
    return {'can_build': can_build, 'checks': checks, 'fingerprint': current, 'scenario_id': scn.id if scn else None,
            'needs_update': bool(scn and saved != current), 'snapshot_known': bool(saved),
            'failed_jobs': [{'id': j.id, 'stage': j.stage, 'error': j.error} for j in failed],
            'note': 'Unmatched or unsynchronized sources remain separate; missing evidence is never filled in.'}
