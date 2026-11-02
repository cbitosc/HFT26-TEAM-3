from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.detections import latest_runs
from app.api.deps import get_evidence
from app.db import get_db
from app.errors import AppError
from app.models import Detection, EvidenceFile, ExtractedFrame, ModelRun, VehicleTrack

router = APIRouter(tags=["tracks"])
NOTE = "Track IDs are per video and per tracking run. They do not establish that two videos show the same vehicle."


def _latest_track_run(db: Session, ev: EvidenceFile) -> ModelRun | None:
    return db.execute(select(ModelRun).where(ModelRun.case_id == ev.case_id, ModelRun.input_sha256 == ev.sha256, ModelRun.stage == "track",
                                             ModelRun.status.in_(("completed", "partially_completed")))
                      .order_by(ModelRun.finished_at.desc())).scalars().first()


def _summary(t: VehicleTrack) -> dict:
    c = t.continuity or {}
    return {"id": t.id, "track_id": t.track_id, "class": t.class_name, "first_frame": t.first_frame, "last_frame": t.last_frame,
            "first_ms": c.get("first_ms", (t.points or [{}])[0].get("time_ms")), "last_ms": c.get("last_ms", (t.points or [{}])[-1].get("time_ms")), "duration_ms": t.duration_ms, "observations": c.get("observations"),
            "mean_confidence": t.mean_confidence, "reliability": c.get("reliability"), "gaps": len(c.get("gaps", [])),
            "flags": c.get("flags", []), "ends_at_frame_border": c.get("ends_at_frame_border"),
            "continuation_candidates": c.get("continuation_candidates", []), "model_run_id": t.model_run_id}


@router.get("/evidence/{evidence_id}/tracks")
def list_tracks(cls: str | None = Query(None, alias="class"), min_observations: int = Query(1, ge=1),
                ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db)) -> dict:
    run = _latest_track_run(db, ev)
    if run is None:
        raise AppError(409, "TRACKS_NOT_READY", "No finished tracking run for this evidence yet")
    q = select(VehicleTrack).where(VehicleTrack.model_run_id == run.id).order_by(VehicleTrack.track_id)
    if cls:
        q = q.where(VehicleTrack.class_name == cls)
    items = [_summary(t) for t in db.execute(q).scalars() if (t.continuity or {}).get("observations", 0) >= min_observations]
    return {"evidence_id": ev.id, "model_run": {"id": run.id, "model_id": run.model_id, "params": run.params, "metrics": run.metrics},
            "items": items, "note": NOTE}


@router.get("/tracks/{track_pk}")
def track_detail(track_pk: str, db: Session = Depends(get_db)) -> dict:
    t = db.get(VehicleTrack, track_pk)
    if t is None:
        raise AppError(404, "TRACK_NOT_FOUND", f"No track with id {track_pk}")
    return _summary(t) | {"evidence_id": t.evidence_id, "points": t.points, "continuity": t.continuity, "note": NOTE,
                          "coordinate_frame": "image pixels of this camera; not metres"}


@router.get("/evidence/{evidence_id}/overlays")
def overlays(from_ms: int = Query(0, ge=0), to_ms: int = Query(..., ge=0), min_conf: float = Query(0.54, ge=0, le=1),
             ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db)) -> dict:
    """Boxes with track IDs for the player, per sampled frame in [from_ms, to_ms] (max 60 s). Boxes exist only on sampled frames;
    any drawing between them is an interpolation and must be shown as such."""
    if to_ms < from_ms or to_ms - from_ms > 60_000:
        raise AppError(422, "INVALID_WINDOW", "to_ms must be >= from_ms and the window at most 60 s")
    runs = latest_runs(db, ev)
    if not runs:
        raise AppError(409, "DETECTIONS_NOT_READY", "No finished detection run for this evidence yet")
    track_run = _latest_track_run(db, ev)
    det_to_track: dict[int, tuple[int, bool]] = {}
    if track_run is not None:
        for t in db.execute(select(VehicleTrack).where(VehicleTrack.model_run_id == track_run.id)).scalars():
            for pt in t.points:
                det_to_track[pt["detection_id"]] = (t.track_id, pt.get("backfilled", False))
    frames = {f.id: f for f in db.execute(select(ExtractedFrame).where(ExtractedFrame.evidence_id == ev.id, ExtractedFrame.sampled.is_(True),
                                                                        ExtractedFrame.time_ms >= from_ms, ExtractedFrame.time_ms <= to_ms)).scalars()}
    per: dict[int, list] = {fid: [] for fid in frames}
    for d in db.execute(select(Detection).where(Detection.frame_id.in_(frames), Detection.model_run_id.in_([r.id for r in runs.values()]),
                                                Detection.confidence >= min_conf)).scalars():
        tid, back = det_to_track.get(d.id, (None, False))
        per[d.frame_id].append({"detection_id": d.id, "track_id": tid, "class": d.class_name, "confidence": d.confidence,
                                "bbox": [d.x1, d.y1, d.x2, d.y2], "backfilled": back, "is_accident_cue": d.is_accident_cue})
    items = sorted(({"frame_no": frames[fid].frame_no, "time_ms": frames[fid].time_ms, "boxes": boxes} for fid, boxes in per.items()),
                   key=lambda x: x["frame_no"])
    return {"evidence_id": ev.id, "from_ms": from_ms, "to_ms": to_ms, "tracking_run": track_run.id if track_run else None,
            "items": items, "note": NOTE}


@router.get("/evidence/{evidence_id}/video-events")
def video_events_list(ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db)) -> dict:
    """Candidate events derived from the latest tracking run, in this video's own media time (not synchronized)."""
    from app.models import SourceEvent

    run = _latest_track_run(db, ev)
    if run is None:
        raise AppError(409, "TRACKS_NOT_READY", "No finished tracking run for this evidence yet")
    rows = db.execute(select(SourceEvent).where(SourceEvent.model_run_id == run.id).order_by(SourceEvent.t_start_ms)).scalars()
    return {"evidence_id": ev.id, "tracking_run": run.id, "time_basis": "media time from the first frame; not synchronized",
            "items": [{"id": e.id, "event_type": e.event_type, "rule_id": e.rule_id, "category": e.category, "t_start_ms": e.t_start_ms, "t_end_ms": e.t_end_ms,
                       "source_ref": e.source_ref, "observations": e.observations, "tracks": (e.entity_hint or {}).get("tracks", [])} for e in rows]}
