from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps import get_actor, get_case, get_evidence, get_factory
from app.api.serializers import job_out
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import AppError
from app.models import Case, EvidenceFile, ExtractedFrame, VideoMetadata
from app.services import audit, jobs
from app.services import video as vid
from app.storage import derived_dir, safe_resolve

router = APIRouter(tags=["video"])


def _require_video(ev: EvidenceFile) -> None:
    if ev.kind not in jobs.VIDEO_KINDS:
        raise AppError(400, "NOT_A_VIDEO", "This endpoint applies to dashcam/cctv evidence")


@router.get("/evidence/{evidence_id}/stream")
def stream(ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> FileResponse:
    """Browser-safe playback copy (derived, H.264, starts at t=0). Range requests supported. Not original evidence."""
    _require_video(ev)
    vm = db.get(VideoMetadata, ev.id)
    if vm is None or not vm.playback_path:
        raise AppError(409, "PLAYBACK_NOT_READY", "The playback copy has not been created yet; check the preprocess job",
                       {"original": f"/api/v1/evidence/{ev.id}/original"})
    path = safe_resolve(settings.storage_path, vm.playback_path)
    return FileResponse(path, media_type="video/mp4", headers={"X-Derived-From": ev.sha256, "X-Evidence-Role": "derived-playback-copy"})


@router.get("/evidence/{evidence_id}/frames")
def list_frames(from_ms: int = Query(0, ge=0), to_ms: int | None = Query(None, ge=0), sampled: bool = True,
                limit: int = Query(1000, ge=1, le=5000), ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db)) -> dict:
    """Frame index. time_ms is media time from the first frame (same scale as the playback copy's currentTime)."""
    _require_video(ev)
    q = select(ExtractedFrame).where(ExtractedFrame.evidence_id == ev.id, ExtractedFrame.time_ms >= from_ms).order_by(ExtractedFrame.frame_no).limit(limit)
    if to_ms is not None:
        q = q.where(ExtractedFrame.time_ms <= to_ms)
    if sampled:
        q = q.where(ExtractedFrame.sampled.is_(True))
    vm = db.get(VideoMetadata, ev.id)
    items = [{"id": f.id, "frame_no": f.frame_no, "time_ms": f.time_ms, "sampled": f.sampled, "blur": f.blur, "brightness": f.brightness,
              "thumbnail_url": f"/api/v1/frames/{f.id}/image" if f.thumbnail_path else None,
              "full_url": f"/api/v1/frames/{f.id}/image?full=true"} for f in db.execute(q).scalars()]
    return {"evidence_id": ev.id, "pts_start_ms": vm.pts_start_ms if vm else None, "items": items,
            "time_basis": "media time from the first frame (container PTS); not wall-clock and not synchronized"}


@router.get("/frames/{frame_id}/image")
def frame_image(frame_id: int, full: bool = False, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> FileResponse:
    """Thumbnail (default) or a frame-accurate full-resolution JPEG, extracted on first request and cached as a derived file."""
    f = db.get(ExtractedFrame, frame_id)
    if f is None:
        raise AppError(404, "FRAME_NOT_FOUND", f"No frame with id {frame_id}")
    ev = db.get(EvidenceFile, f.evidence_id)
    if not full:
        if not f.thumbnail_path:
            raise AppError(404, "THUMBNAIL_NOT_AVAILABLE", "This frame was not sampled; request full=true or reprocess the interval")
        return FileResponse(safe_resolve(settings.storage_path, f.thumbnail_path), media_type="image/jpeg")
    out = derived_dir(settings.storage_path, ev.case_id, ev.id, "full") / f"f{f.frame_no:06d}.jpg"
    if not out.is_file():
        vid.extract_full_frame(safe_resolve(settings.storage_path, ev.stored_path), f.time_ms, out)
    return FileResponse(out, media_type="image/jpeg", headers={"X-Frame-No": str(f.frame_no), "X-Time-Ms": str(f.time_ms)})


class IntervalRequest(BaseModel):
    from_ms: int = Field(ge=0)
    to_ms: int = Field(ge=0)
    sample_fps: float | None = Field(default=None, gt=0, le=240, description="omit for every frame in the interval")

    @model_validator(mode="after")
    def _order(self):
        if self.to_ms < self.from_ms:
            raise ValueError("to_ms must be >= from_ms")
        if self.to_ms - self.from_ms > 120_000:
            raise ValueError("interval longer than 120 s; use a lower sample rate via /cases/{id}/process instead")
        return self


@router.post("/evidence/{evidence_id}/reprocess", status_code=202)
def reprocess_interval(body: IntervalRequest, background: BackgroundTasks, ev: EvidenceFile = Depends(get_evidence),
                       db: Session = Depends(get_db), settings: Settings = Depends(get_settings),
                       factory: sessionmaker = Depends(get_factory), actor: str = Depends(get_actor)) -> dict:
    _require_video(ev)
    job = jobs.enqueue(db, case_id=ev.case_id, evidence_id=ev.id, stage=jobs.STAGE_INTERVAL, input_hash=ev.sha256, params=body.model_dump())
    audit.record(db, actor=actor, action="interval_reprocess_requested", case_id=ev.case_id, target_type="evidence", target_id=ev.id,
                 details={"from_ms": body.from_ms, "to_ms": body.to_ms})
    db.commit()
    background.add_task(jobs.run_pending, factory, settings)
    return job_out(job)


class ProcessRequest(BaseModel):
    stages: list[Literal["preprocess", "detect", "track"]] = ["preprocess"]
    sample_fps: float | None = Field(default=None, gt=0, le=60)
    max_frames: int | None = Field(default=None, ge=1, le=100_000)
    chain_detect: bool = Field(default=True, description="false: preprocess only (e.g. when boxes will be imported instead of detected)")


@router.post("/cases/{case_id}/process", status_code=202)
def process_case(body: ProcessRequest, background: BackgroundTasks, case: Case = Depends(get_case), db: Session = Depends(get_db),
                 settings: Settings = Depends(get_settings), factory: sessionmaker = Depends(get_factory), actor: str = Depends(get_actor)) -> dict:
    """(Re)run stages for every valid video in the case. Same input + same parameters reuses the earlier result.
    `preprocess` chains into `detect` automatically; `detect` alone re-runs detection on the existing sampled frames."""
    params = jobs.preprocess_params(settings, body.sample_fps, body.max_frames) | ({} if body.chain_detect else {"chain_detect": False})
    videos = db.execute(select(EvidenceFile).where(EvidenceFile.case_id == case.id, EvidenceFile.kind.in_(jobs.VIDEO_KINDS),
                                                   EvidenceFile.status == "valid")).scalars().all()
    created = []
    for v in videos:
        if "preprocess" in body.stages:
            created.append(jobs.enqueue(db, case_id=case.id, evidence_id=v.id, stage=jobs.STAGE_PREPROCESS, input_hash=v.sha256, params=params))
        elif "detect" in body.stages:
            created.append(jobs.enqueue(db, case_id=case.id, evidence_id=v.id, stage=jobs.STAGE_DETECT, input_hash=v.sha256,
                                        params=jobs.detect_params(settings)))
        elif "track" in body.stages:
            created.append(jobs.enqueue(db, case_id=case.id, evidence_id=v.id, stage=jobs.STAGE_TRACK, input_hash=v.sha256, params={"version": "1"}))
    audit.record(db, actor=actor, action="processing_requested", case_id=case.id, target_type="case", target_id=case.id,
                 details={"stages": ",".join(body.stages), "videos": len(videos), "sample_fps": params["sample_fps"]})
    db.commit()
    background.add_task(jobs.run_pending, factory, settings, 50)
    return {"jobs": [job_out(j) for j in created], "skipped_note": "only videos with status 'valid' are processed"}
