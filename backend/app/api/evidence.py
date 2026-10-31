import json
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps import get_actor, get_case, get_evidence, get_factory
from app.api.serializers import evidence_out, job_out
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import AppError
from app.models import Actor, Case, EvidenceFile, ExtractedFrame, SourceAnnotation, SourceEvent, VideoMetadata
from app.services import audit, jobs
from app.services.ingest import ingest_upload
from app.storage import safe_resolve, sanitize_filename, sha256_file

router = APIRouter(tags=["evidence"])


def _annotations(db: Session, ids: list[str]) -> dict[str, SourceAnnotation]:
    if not ids:
        return {}
    rows = db.execute(select(SourceAnnotation).where(SourceAnnotation.evidence_id.in_(ids))).scalars()
    return {row.evidence_id: row for row in rows}


def _with_source(db: Session, ev: EvidenceFile, vm: VideoMetadata | None = None) -> dict:
    return evidence_out(ev, vm, _annotations(db, [ev.id]).get(ev.id))


def _parse_provenance(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except ValueError:
        raise AppError(422, "INVALID_PROVENANCE", "provenance must be a JSON object")
    if not isinstance(value, dict):
        raise AppError(422, "INVALID_PROVENANCE", "provenance must be a JSON object")
    return value


@router.post("/cases/{case_id}/evidence", status_code=201)
def upload_evidence(response: Response, background: BackgroundTasks, file: UploadFile = File(...), kind: str = Form(...),
                    synthetic: bool = Form(...), provenance: str | None = Form(default=None), licence: str | None = Form(default=None),
                    case: Case = Depends(get_case), db: Session = Depends(get_db), settings: Settings = Depends(get_settings),
                    factory: sessionmaker = Depends(get_factory), actor: str = Depends(get_actor)) -> dict:
    """`synthetic` is required: every file must be explicitly declared real or synthetic/staged."""
    ev, duplicate, job = ingest_upload(db, settings, case=case, upload=file, kind=kind, synthetic=synthetic,
                                       provenance=_parse_provenance(provenance), licence=licence, actor=actor)
    db.commit()
    if duplicate:
        response.status_code = 200
        return {"duplicate": True, "evidence": _with_source(db, ev, db.get(VideoMetadata, ev.id)), "job": None}
    background.add_task(jobs.run_pending, factory, settings)  # validation starts right after the response; `python -m app.worker` also works
    return {"duplicate": False, "evidence": _with_source(db, ev), "job": job_out(job)}


@router.get("/cases/{case_id}/evidence")
def list_evidence(kind: str | None = None, status: str | None = None, case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    q = select(EvidenceFile).where(EvidenceFile.case_id == case.id).order_by(EvidenceFile.uploaded_at)
    if kind:
        q = q.where(EvidenceFile.kind == kind)
    if status:
        q = q.where(EvidenceFile.status == status)
    items = db.execute(q).scalars().all()
    ids = [e.id for e in items]
    meta = {m.evidence_id: m for m in db.execute(select(VideoMetadata).where(VideoMetadata.evidence_id.in_(ids))).scalars()} if items else {}
    notes = _annotations(db, ids)
    return {"items": [evidence_out(e, meta.get(e.id), notes.get(e.id)) for e in items]}


@router.get("/evidence/{evidence_id}")
def evidence_detail(ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db)) -> dict:
    return _with_source(db, ev, db.get(VideoMetadata, ev.id))


class SourcePatch(BaseModel):
    display_name: str | None = Field(default=None, max_length=160)
    camera_role: str | None = None
    location_text: str | None = Field(default=None, max_length=500)
    recording_start: datetime | None = None
    recording_end: datetime | None = None
    timezone: str | None = Field(default=None, max_length=64)
    clock_offset_ms: int | None = None
    clock_offset_reference_id: str | None = None


def _aware(value: datetime | None, name: str) -> None:
    if value is not None and value.tzinfo is None:
        raise AppError(422, "TIMEZONE_REQUIRED", f"{name} must include a timezone offset")


@router.patch("/evidence/{evidence_id}/source")
def patch_source(body: SourcePatch, ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    """Edit the investigator's description. The stored file, filename, kind, and hash do not change."""
    ann = db.get(SourceAnnotation, ev.id) or SourceAnnotation(evidence_id=ev.id)
    sent = body.model_fields_set
    if "display_name" in sent:
        ann.display_name = body.display_name
    if "location_text" in sent:
        ann.location_text = body.location_text
    if "camera_role" in sent:
        if body.camera_role not in (None, "cctv", "dashcam", "other"):
            raise AppError(422, "CAMERA_ROLE_INVALID", "camera_role must be cctv, dashcam, other, or null")
        ann.camera_role = body.camera_role
    if "recording_start" in sent:
        _aware(body.recording_start, "recording_start")
        ann.recording_start = body.recording_start
    if "recording_end" in sent:
        _aware(body.recording_end, "recording_end")
        ann.recording_end = body.recording_end
    if ann.recording_start is not None and ann.recording_end is not None and ann.recording_end < ann.recording_start:
        raise AppError(422, "RECORDING_WINDOW", "recording_end is before recording_start")
    if "timezone" in sent:
        if body.timezone:
            try:
                ZoneInfo(body.timezone)
            except ZoneInfoNotFoundError:
                raise AppError(422, "INVALID_TIMEZONE", f"{body.timezone} is not an IANA timezone")
        ann.timezone = body.timezone
    if "clock_offset_ms" in sent or "clock_offset_reference_id" in sent:
        offset = body.clock_offset_ms if "clock_offset_ms" in sent else ann.clock_offset_ms
        ref = body.clock_offset_reference_id if "clock_offset_reference_id" in sent else ann.clock_offset_reference_id
        if (offset is None) != (ref is None):
            raise AppError(422, "OFFSET_REFERENCE_REQUIRED", "clock_offset_ms and clock_offset_reference_id are set together")
        if ref is not None:
            other = db.get(EvidenceFile, ref)
            if other is None or other.case_id != ev.case_id or other.id == ev.id:
                raise AppError(404, "EVIDENCE_NOT_FOUND", "clock_offset_reference_id is not another source in this case")
        ann.clock_offset_ms = offset
        ann.clock_offset_reference_id = ref
        ann.clock_offset_basis = "declared_by_investigator" if offset is not None else None
    db.add(ann)
    audit.record(db, actor=who, action="source_annotated", case_id=ev.case_id, target_type="evidence", target_id=ev.id,
                 details={"fields": sorted(sent)})
    db.commit()
    return _with_source(db, ev, db.get(VideoMetadata, ev.id))


@router.get("/evidence/{evidence_id}/original")
def evidence_original(verify: bool = Query(False, description="re-hash the stored file and compare before serving"),
                      ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db), settings: Settings = Depends(get_settings),
                      actor: str = Depends(get_actor)) -> FileResponse:
    """The original bytes, unchanged. Supports HTTP Range requests, so browsers can play and seek video."""
    try:
        path = safe_resolve(settings.storage_path, ev.stored_path)
    except ValueError:
        raise AppError(500, "STORAGE_PATH_INVALID", "Stored path is outside the evidence store")
    if not path.is_file():
        raise AppError(404, "ORIGINAL_MISSING", "The stored file is missing from the evidence store")
    if verify and sha256_file(path) != ev.sha256:
        audit.record(db, actor=actor, action="integrity_failure", case_id=ev.case_id, target_type="evidence", target_id=ev.id)
        db.commit()
        raise AppError(409, "INTEGRITY_MISMATCH", "Stored file no longer matches its recorded SHA-256", {"expected": ev.sha256})
    return FileResponse(path, media_type=ev.mime_type or "application/octet-stream", filename=sanitize_filename(ev.original_filename),
                        content_disposition_type="inline", headers={"X-Content-SHA256": ev.sha256})


class ReviewedFall(BaseModel):
    actor_id: str
    start_ms: float = Field(ge=0, allow_inf_nan=False)
    end_ms: float = Field(ge=0, allow_inf_nan=False)
    uncertainty_ms: float = Field(ge=0, allow_inf_nan=False)
    note: str = Field(min_length=10, max_length=1000)

    @model_validator(mode="after")
    def order(self):
        if self.end_ms < self.start_ms:
            raise ValueError("End must follow start")
        return self


@router.post("/evidence/{evidence_id}/reviewed-fall", status_code=201)
def reviewed_fall(body: ReviewedFall, ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    """Human-reviewed fall interval, explicitly attributed. Never a model detection or a contact/fault conclusion."""
    actor = db.get(Actor, body.actor_id)
    vm = db.get(VideoMetadata, ev.id)
    if ev.kind not in ("cctv", "dashcam") or not actor or actor.case_id != ev.case_id:
        raise AppError(422, "INVALID_REVIEW_SOURCE", "Choose a video and actor from the same case")
    if not vm or not vm.duration_ms or body.end_ms > vm.duration_ms:
        raise AppError(422, "REVIEW_OUTSIDE_VIDEO", "Choose an interval within the processed video")
    frames = list(db.scalars(select(ExtractedFrame).where(ExtractedFrame.evidence_id == ev.id, ExtractedFrame.time_ms >= body.start_ms,
                                                        ExtractedFrame.time_ms <= body.end_ms).order_by(ExtractedFrame.time_ms)))
    if not frames:
        raise AppError(409, "FRAMES_NOT_READY", "Process the video before recording a reviewed observation")
    source = SourceEvent(case_id=ev.case_id, evidence_id=ev.id, stage="video_events", category="direct_observation", event_type="rider_fall_observed",
                         t_start_ms=body.start_ms, t_end_ms=body.end_ms, uncertainty_ms=body.uncertainty_ms,
                         source_ref={"kind":"human_reviewed_video_interval", "evidence_id":ev.id, "frames":[frames[0].frame_no,frames[-1].frame_no],"reviewed_by":who},
                         observations={"description":body.note,"reviewed_by":who,"review_method":"human visual review; not an automated detector result"},
                         entity_hint={"reviewed_actor_id":actor.id}, confidence={"basis":"human visual review; interval and identity require review"}, rule_id="HUMAN-FALL-OBS-01")
    db.add(source);db.flush()
    audit.record(db, actor=who, action="video_fall_reviewed", case_id=ev.case_id, target_type="source_event", target_id=source.id, details=body.model_dump())
    db.commit()
    return {"id":source.id,"category":source.category,"event_type":source.event_type,"source_ref":source.source_ref,"observations":source.observations}
