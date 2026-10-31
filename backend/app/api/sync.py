from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_actor, get_case, get_evidence
from app.db import get_db
from app.errors import AppError
from app.models import Case, ClockRecord, EvidenceFile, SourceAnnotation, SourceEvent, SyncEdge, VideoMetadata
from app.services import audit, sync

router = APIRouter(tags=["synchronization"])


def edge_out(e: SyncEdge) -> dict:
    return {"id": e.id, "a_evidence": e.a_evidence, "b_evidence": e.b_evidence, "offset_ms": e.offset_ms, "bound_ms": e.bound_ms, "basis": e.basis,
            "status": e.status, "note": e.note, "evidence_refs": e.evidence_refs, "created_by": e.created_by, "decided_by": e.decided_by,
            "meaning": f"time in {e.b_evidence} = time in {e.a_evidence} + {e.offset_ms:g} ms (±{e.bound_ms:g} ms)"}


def clock_out(c: ClockRecord) -> dict:
    return {"evidence_id": c.evidence_id, "utc_zero": c.utc_zero, "bound_ms": c.bound_ms, "basis": c.basis, "timezone": c.timezone, "note": c.note,
            "used_for_sync": c.basis in sync.TRUSTED_CLOCK_BASES and c.utc_zero is not None}


def load_state(db: Session, case_id: str):
    evidence = [{"id": e.id, "kind": e.kind} for e in db.execute(select(EvidenceFile).where(EvidenceFile.case_id == case_id, EvidenceFile.status == "valid",
                EvidenceFile.kind.in_(("dashcam", "cctv", "sensor_csv")))).scalars()]
    clocks = [{"evidence_id": c.evidence_id, "utc_zero": c.utc_zero, "bound_ms": c.bound_ms, "basis": c.basis}
              for c in db.execute(select(ClockRecord).where(ClockRecord.case_id == case_id)).scalars()]
    edges = [{"id": e.id, "a_evidence": e.a_evidence, "b_evidence": e.b_evidence, "offset_ms": e.offset_ms, "bound_ms": e.bound_ms, "basis": e.basis, "status": e.status}
             for e in db.execute(select(SyncEdge).where(SyncEdge.case_id == case_id)).scalars()]
    from app.services.sources import annotation_edges
    rows = db.execute(select(SourceAnnotation).where(SourceAnnotation.evidence_id.in_([e["id"] for e in evidence]))).scalars()
    edges += annotation_edges([{k: getattr(a, k) for k in ("evidence_id", "clock_offset_ms", "clock_offset_reference_id")} for a in rows])
    return evidence, clocks, edges


def solve_case(db: Session, case_id: str, **kw) -> dict:
    evidence, clocks, edges = load_state(db, case_id)
    return sync.solve(evidence, clocks, edges, **kw)


class ClockBody(BaseModel):
    utc_zero: datetime | None = Field(default=None, description="UTC instant of this source's time 0 (first frame / first sample)")
    bound_ms: float = Field(default=0, ge=0)
    basis: Literal["declared_by_investigator", "simulation_clock", "embedded_metadata_unverified"] = "declared_by_investigator"
    timezone: str | None = None
    note: str | None = None


@router.put("/evidence/{evidence_id}/clock")
def set_clock(body: ClockBody, ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    """Record what is known about this source's clock. Only 'declared_by_investigator' and 'simulation_clock' are ever used for synchronization."""
    if body.utc_zero is not None and body.utc_zero.tzinfo is None:
        raise AppError(422, "TIMEZONE_REQUIRED", "utc_zero must include a timezone offset (e.g. 2026-10-30T10:32:00+05:30)")
    rec = db.execute(select(ClockRecord).where(ClockRecord.evidence_id == ev.id)).scalars().first() or ClockRecord(case_id=ev.case_id, evidence_id=ev.id, created_by=who)
    rec.utc_zero, rec.bound_ms, rec.basis, rec.timezone, rec.note = body.utc_zero, body.bound_ms, body.basis, body.timezone, body.note
    db.add(rec)
    audit.record(db, actor=who, action="clock_declared", case_id=ev.case_id, target_type="evidence", target_id=ev.id,
                 details={"basis": body.basis, "bound_ms": body.bound_ms})
    db.commit()
    return clock_out(rec)


class EdgeBody(BaseModel):
    a_evidence: str
    b_evidence: str
    offset_ms: float
    bound_ms: float = Field(ge=0)
    basis: Literal["simulation_clock", "known_offset", "frame_correspondence"] = "known_offset"
    note: str | None = None


def _check_pair(db: Session, case: Case, a: str, b: str) -> None:
    if a == b:
        raise AppError(422, "SAME_EVIDENCE", "A clock relation needs two different sources")
    for eid in (a, b):
        e = db.get(EvidenceFile, eid)
        if e is None or e.case_id != case.id or e.kind not in ("dashcam", "cctv", "sensor_csv"):
            raise AppError(404, "EVIDENCE_NOT_FOUND", f"{eid} is not a video or sensor source in this case")


@router.post("/cases/{case_id}/sync-edges", status_code=201)
def add_edge(body: EdgeBody, case: Case = Depends(get_case), db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    """Investigator-stated relation: time in b = time in a + offset_ms (± bound_ms)."""
    _check_pair(db, case, body.a_evidence, body.b_evidence)
    e = SyncEdge(case_id=case.id, a_evidence=body.a_evidence, b_evidence=body.b_evidence, offset_ms=body.offset_ms, bound_ms=body.bound_ms,
                 basis=body.basis, status="declared", note=body.note, created_by=who)
    db.add(e)
    db.flush()
    audit.record(db, actor=who, action="sync_edge_declared", case_id=case.id, target_type="sync_edge", target_id=e.id, details={"basis": body.basis, "offset_ms": body.offset_ms})
    db.commit()
    return edge_out(e)


class Mark(BaseModel):
    evidence_id: str
    time_ms: float = Field(ge=0, description="source time of the shared instant (e.g. a flash visible in both videos)")


class SyncPointBody(BaseModel):
    a: Mark
    b: Mark
    marking_error_ms: float | None = Field(default=None, ge=0, description="how precisely the instant was marked in each source; default: half a frame/sample")
    note: str | None = None


@router.post("/cases/{case_id}/sync-points", status_code=201)
def add_sync_point(body: SyncPointBody, case: Case = Depends(get_case), db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    """The same instant marked in two sources by a person (flash, clap, impact). Creates a verified relation."""
    _check_pair(db, case, body.a.evidence_id, body.b.evidence_id)
    err = body.marking_error_ms
    if err is None:
        err = 0.0
        for m in (body.a, body.b):
            vm = db.get(VideoMetadata, m.evidence_id)
            err += (500.0 / vm.fps_nominal) if vm and vm.fps_nominal else 50.0
    e = SyncEdge(case_id=case.id, a_evidence=body.a.evidence_id, b_evidence=body.b.evidence_id, offset_ms=body.b.time_ms - body.a.time_ms, bound_ms=err,
                 basis="manual_sync_point", status="verified", note=body.note, created_by=who, decided_by=who,
                 evidence_refs={"a_time_ms": body.a.time_ms, "b_time_ms": body.b.time_ms})
    db.add(e)
    db.flush()
    audit.record(db, actor=who, action="sync_point_marked", case_id=case.id, target_type="sync_edge", target_id=e.id,
                 details={"offset_ms": e.offset_ms, "bound_ms": err})
    db.commit()
    return edge_out(e)


@router.get("/cases/{case_id}/sync")
def sync_state(case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    res = solve_case(db, case.id)
    edges = db.execute(select(SyncEdge).where(SyncEdge.case_id == case.id).order_by(SyncEdge.created_at)).scalars().all()
    clocks = db.execute(select(ClockRecord).where(ClockRecord.case_id == case.id)).scalars().all()
    return res | {"edges": [edge_out(e) for e in edges], "clock_records": [clock_out(c) for c in clocks],
                  "rule": "Sources are synchronized only through a declared/verified relation. Similar-looking timestamps, embedded metadata and unconfirmed proposals are not a basis.",
                  "unsynchronized_note": "Events from unsynchronized sources keep their own time and are never ordered against other sources."}


@router.post("/cases/{case_id}/sync/proposals", status_code=201)
def make_proposals(case: Case = Depends(get_case), db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    """Suggest clock relations by matching a video collision candidate with a sensor impact. Stored as 'proposed': they change nothing until confirmed."""
    rows = db.execute(select(SourceEvent).where(SourceEvent.case_id == case.id)).scalars().all()
    vid = [{"id": r.id, "evidence_id": r.evidence_id, "t_start_ms": r.t_start_ms, "t_end_ms": r.t_end_ms, "uncertainty_ms": r.uncertainty_ms}
           for r in rows if r.event_type == "possible_collision"]
    sen = [{"id": r.id, "evidence_id": r.evidence_id, "t_start_ms": r.t_start_ms, "t_end_ms": r.t_end_ms, "uncertainty_ms": r.uncertainty_ms}
           for r in rows if r.event_type in ("collision_flag", "acceleration_spike")]
    existing = {(e.a_evidence, e.b_evidence) for e in db.execute(select(SyncEdge).where(SyncEdge.case_id == case.id, SyncEdge.status != "rejected")).scalars()}
    made = []
    for p in sync.propose_anchor_edges(vid, sen):
        if (p["a_evidence"], p["b_evidence"]) in existing or (p["b_evidence"], p["a_evidence"]) in existing:
            continue
        e = SyncEdge(case_id=case.id, created_by=who, **p)
        db.add(e)
        db.flush()
        made.append(edge_out(e))
    audit.record(db, actor=who, action="sync_proposals_generated", case_id=case.id, details={"count": len(made)})
    db.commit()
    return {"items": made, "note": "Proposals are not applied. Review the two source events, then confirm or reject."}


@router.post("/sync-edges/{edge_id}/{decision}")
def decide_edge(edge_id: str, decision: Literal["confirm", "reject"], db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    e = db.get(SyncEdge, edge_id)
    if e is None:
        raise AppError(404, "EDGE_NOT_FOUND", f"No clock relation with id {edge_id}")
    if e.status not in ("proposed", "declared", "verified"):
        raise AppError(409, "ALREADY_DECIDED", f"Relation is already {e.status}")
    e.status = "verified" if decision == "confirm" else "rejected"
    e.decided_by = who
    audit.record(db, actor=who, action=f"sync_edge_{e.status}", case_id=e.case_id, target_type="sync_edge", target_id=e.id)
    db.commit()
    return edge_out(e)


@router.get("/cases/{case_id}/playback-map")
def playback_map(evidence_id: str, video_time_ms: float = Query(..., ge=0), case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    """Source time -> case time. `case_time` is null (with the reason) when the source is not synchronized with anything."""
    ev = db.get(EvidenceFile, evidence_id)
    if ev is None or ev.case_id != case.id:
        raise AppError(404, "EVIDENCE_NOT_FOUND", "No such evidence in this case")
    lk = sync.lookup(solve_case(db, case.id))
    iv = sync.to_case_interval(lk, evidence_id, video_time_ms, None, 0.0)
    if iv is None:
        return {"evidence_id": evidence_id, "source_time_ms": video_time_ms, "case_time": None,
                "reason": "this source has no recorded clock relation to any other source; it keeps its own time"}
    return {"evidence_id": evidence_id, "source_time_ms": video_time_ms, "sync_group": iv["group"],
            "case_time": {"ms": iv["start_ms"], "uncertainty_ms": iv["uncertainty_ms"]}, "group_consistent": iv["consistent"]}
