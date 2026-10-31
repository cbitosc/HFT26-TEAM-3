from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import insert, select
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps import get_actor, get_evidence, get_factory
from app.db import get_db
from app.config import Settings, get_settings
from app.errors import AppError
from app.models import Detection, EvidenceFile, ExtractedFrame, ModelRun, VideoMetadata
from app.services import audit, jobs
from app.services.video import display_size

router = APIRouter(tags=["detections"])
DETECTION_STAGES = ("detect", "accident_cue")


def _run_out(r: ModelRun) -> dict:
    return {"id": r.id, "stage": r.stage, "model_id": r.model_id, "model_version": r.model_version, "params": r.params, "device": r.device,
            "status": r.status, "started_at": r.started_at, "finished_at": r.finished_at, "metrics": r.metrics}


def latest_runs(db: Session, ev: EvidenceFile) -> dict[str, ModelRun]:
    """Most recent finished run per detection stage for exactly these bytes."""
    runs = db.execute(select(ModelRun).where(ModelRun.case_id == ev.case_id, ModelRun.input_sha256 == ev.sha256,
                                             ModelRun.stage.in_(DETECTION_STAGES), ModelRun.status.in_(("completed", "partially_completed")))
                      .order_by(ModelRun.finished_at.desc())).scalars().all()
    out: dict[str, ModelRun] = {}
    for r in runs:
        out.setdefault(r.stage, r)
    return out


@router.get("/evidence/{evidence_id}/model-runs")
def model_runs(ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db)) -> dict:
    runs = db.execute(select(ModelRun).where(ModelRun.case_id == ev.case_id, ModelRun.input_sha256 == ev.sha256)
                      .order_by(ModelRun.started_at)).scalars().all()
    return {"items": [_run_out(r) for r in runs]}


@router.get("/evidence/{evidence_id}/detections")
def detections(from_ms: int = Query(0, ge=0), to_ms: int | None = Query(None, ge=0),
               classes: str | None = Query(None, description="comma-separated, e.g. car,bus,pedestrian,accident_cue"),
               min_conf: float = Query(0.54, ge=0, le=1, description="display threshold; boxes down to the storage threshold exist"),
               include_accident_cue: bool = True, model_run_id: str | None = None, include_empty: bool = False,
               ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db)) -> dict:
    """Machine detections per sampled frame. Coordinates are pixels of the frame OpenCV decoded. video.rotation is reported separately and is not applied to these boxes."""
    if ev.kind not in ("dashcam", "cctv"):
        raise AppError(400, "NOT_A_VIDEO", "Detections exist only for dashcam/cctv evidence")
    if model_run_id:
        run = db.get(ModelRun, model_run_id)
        if run is None or run.input_sha256 != ev.sha256:
            raise AppError(404, "MODEL_RUN_NOT_FOUND", "No such model run for this evidence")
        runs = {run.stage: run}
    else:
        runs = latest_runs(db, ev)
        if not include_accident_cue:
            runs.pop("accident_cue", None)
    if not runs:
        raise AppError(409, "DETECTIONS_NOT_READY", "No finished detection run for this evidence yet")

    frames_q = select(ExtractedFrame).where(ExtractedFrame.evidence_id == ev.id, ExtractedFrame.sampled.is_(True), ExtractedFrame.time_ms >= from_ms)
    if to_ms is not None:
        frames_q = frames_q.where(ExtractedFrame.time_ms <= to_ms)
    frames = {f.id: f for f in db.execute(frames_q).scalars()}
    q = select(Detection).where(Detection.frame_id.in_(frames), Detection.model_run_id.in_([r.id for r in runs.values()]),
                                Detection.confidence >= min_conf)
    wanted = {c.strip() for c in classes.split(",")} if classes else None
    per_frame: dict[int, list] = {fid: [] for fid in frames} if include_empty else {}
    for d in db.execute(q).scalars():
        if wanted and d.class_name not in wanted:
            continue
        per_frame.setdefault(d.frame_id, []).append({"id": d.id, "class": d.class_name, "confidence": d.confidence,
                                                     "bbox": [d.x1, d.y1, d.x2, d.y2], "model_run_id": d.model_run_id,
                                                     "category": "machine_detection", "is_accident_cue": d.is_accident_cue})
    vm = db.get(VideoMetadata, ev.id)
    items = sorted(({"frame_id": fid, "frame_no": frames[fid].frame_no, "time_ms": frames[fid].time_ms, "detections": dets}
                    for fid, dets in per_frame.items()), key=lambda x: x["frame_no"])
    frame_size = None
    if vm is not None:
        fw, fh = display_size(vm.width, vm.height, vm.rotation)
        frame_size = {"width": fw, "height": fh}
    return {"evidence_id": ev.id, "frame_size": frame_size, "min_confidence": min_conf,
            "frames_considered": len(frames), "model_runs": [_run_out(r) for r in runs.values()], "items": items,
            "note": "Machine detections. The accident cue is a weak single-class model and never establishes a collision by itself."}


IMPORT_CLASSES = Literal["car", "truck", "bus", "motorcycle", "bicycle", "pedestrian", "traffic_light"]


class ImportBox(BaseModel):
    cls: IMPORT_CLASSES = Field(alias="class")
    confidence: float = Field(ge=0, le=1)
    bbox: list[float] = Field(min_length=4, max_length=4)


class ImportFrame(BaseModel):
    frame_no: int = Field(ge=0)
    boxes: list[ImportBox]


class ImportBody(BaseModel):
    model_id: str = Field(min_length=1, max_length=80)
    source: Literal["oracle", "external"] = Field(description="'oracle' = boxes from a synthetic world model (not a detector); 'external' = another detector's output")
    note: str | None = Field(default=None, max_length=500)
    frames: list[ImportFrame] = Field(max_length=20000)


@router.post("/evidence/{evidence_id}/detections/import", status_code=201)
def import_detections(body: ImportBody, background: BackgroundTasks, ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db),
                      settings: Settings = Depends(get_settings), factory: sessionmaker = Depends(get_factory), who: str = Depends(get_actor)) -> dict:
    """Store boxes produced elsewhere as a detector run, clearly labelled by source, then track them. Used for synthetic scenarios (oracle)
    and for outputs of other detectors. Boxes must refer to sampled frames of this video."""
    if ev.kind not in ("dashcam", "cctv"):
        raise AppError(400, "NOT_A_VIDEO", "Detections exist only for dashcam/cctv evidence")
    frames = {f.frame_no: f for f in db.execute(select(ExtractedFrame).where(ExtractedFrame.evidence_id == ev.id, ExtractedFrame.sampled.is_(True))).scalars()}
    if not frames:
        raise AppError(409, "NOT_PREPROCESSED", "Run preprocessing first: detections attach to sampled frames")
    unknown = sorted({fr.frame_no for fr in body.frames} - set(frames))
    if unknown:
        raise AppError(422, "UNKNOWN_FRAMES", f"{len(unknown)} frame number(s) are not sampled frames of this video", {"first": unknown[:10]})
    vm = db.get(VideoMetadata, ev.id)
    now = datetime.now(timezone.utc)
    params = {"imported": True, "source": body.source, "note": body.note, "frames": len(body.frames)}
    run = ModelRun(case_id=ev.case_id, stage="detect", model_id=f"{body.source}:{body.model_id}", model_version=f"imported by {who}", params=params,
                   params_hash=jobs.params_hash(params | {"n": sum(len(f.boxes) for f in body.frames)}), input_sha256=ev.sha256, device="none",
                   started_at=now, finished_at=now, status="completed")
    db.add(run)
    db.flush()
    rows = []
    for fr in body.frames:
        for b in fr.boxes:
            x1, y1, x2, y2 = b.bbox
            if not (x2 > x1 and y2 > y1) or (vm and (x2 < 0 or y2 < 0 or x1 > vm.width or y1 > vm.height)):
                raise AppError(422, "INVALID_BOX", f"invalid or out-of-frame box in frame {fr.frame_no}")
            rows.append({"frame_id": frames[fr.frame_no].id, "model_run_id": run.id, "class_name": b.cls, "confidence": b.confidence,
                         "x1": x1, "y1": y1, "x2": x2, "y2": y2, "is_accident_cue": False})
    for i in range(0, len(rows), 5000):
        db.execute(insert(Detection), rows[i:i + 5000])
    run.metrics = {"boxes": len(rows), "frames": len(body.frames), "imported": True, "source": body.source}
    job = jobs.enqueue(db, case_id=ev.case_id, evidence_id=ev.id, stage=jobs.STAGE_TRACK, input_hash=ev.sha256, params={"version": "1"})
    audit.record(db, actor=who, action="detections_imported", case_id=ev.case_id, target_type="evidence", target_id=ev.id,
                 details={"source": body.source, "model_id": body.model_id, "boxes": len(rows)})
    db.commit()
    background.add_task(jobs.run_pending, factory, settings)
    return {"model_run_id": run.id, "boxes": len(rows), "source": body.source, "track_job": job.id,
            "note": "oracle boxes come from a synthetic world model, not from a detector" if body.source == "oracle" else "boxes come from an external detector"}
