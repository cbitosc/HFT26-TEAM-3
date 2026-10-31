"""Evidence ingestion: stream to staging, hash, sniff the real content type, store read-only, register, enqueue validation."""
from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.errors import AppError
from app.models import Case, EvidenceFile, ProcessingJob
from app.services import audit, jobs
from app.services.filetypes import ALLOWED, VIDEO_KINDS, check_kind, final_mime, sniff
from app.storage import UploadTooLarge, commit_staged, discard_staged, sanitize_filename, stage_upload


def ingest_upload(session: Session, settings: Settings, *, case: Case, upload: UploadFile, kind: str, synthetic: bool,
                  provenance: dict | None, licence: str | None, actor: str) -> tuple[EvidenceFile, bool, ProcessingJob | None]:
    """Returns (evidence, duplicate, job). Raises AppError for oversize, empty, or mismatched files."""
    if kind not in ALLOWED:
        raise AppError(422, "INVALID_KIND", f"kind must be one of {sorted(ALLOWED)}")
    if case.status == "closed":
        raise AppError(409, "CASE_CLOSED", "Evidence cannot be added to a closed case")
    if case.designation == "real" and synthetic:
        raise AppError(
            422, "SYNTHETIC_IN_REAL_CASE",
            "This investigation is designated real. Evidence declared synthetic cannot be added to it. "
            "The server checks the case designation against the declaration on this request; a control in the browser is not enough.",
            {"designation": case.designation, "synthetic": True},
        )

    limit = (settings.max_video_mb if kind in VIDEO_KINDS or kind == "other" else settings.max_other_mb) * 1024 * 1024
    try:
        staged = stage_upload(upload.file, settings.storage_path, limit)
    except UploadTooLarge as exc:
        raise AppError(413, "FILE_TOO_LARGE", f"File exceeds the {limit // (1024 * 1024)} MB limit for kind '{kind}'", {"limit_bytes": exc.limit})

    if staged.size == 0:
        discard_staged(staged)
        raise AppError(422, "EMPTY_FILE", "The uploaded file is empty")
    sniffed = sniff(staged.head)
    reason = check_kind(kind, sniffed, staged.head)
    if reason:
        discard_staged(staged)
        raise AppError(415, "UNSUPPORTED_CONTENT", reason, {"detected": sniffed.mime, "kind": kind})

    existing = session.execute(select(EvidenceFile).where(EvidenceFile.case_id == case.id, EvidenceFile.sha256 == staged.sha256)).scalar_one_or_none()
    if existing:
        discard_staged(staged)
        audit.record(session, actor=actor, action="duplicate_upload", case_id=case.id, target_type="evidence", target_id=existing.id,
                     details={"sha256": existing.sha256})
        return existing, True, None

    rel = commit_staged(staged, settings.storage_path)
    ev = EvidenceFile(case_id=case.id, kind=kind, original_filename=sanitize_filename(upload.filename), stored_path=rel,
                      mime_type=final_mime(kind, sniffed), size_bytes=staged.size, sha256=staged.sha256, synthetic=synthetic,
                      provenance=provenance, licence=licence, status="uploaded")
    session.add(ev)
    try:
        session.flush()
    except IntegrityError:  # concurrent identical upload won the race
        session.rollback()
        dup = session.execute(select(EvidenceFile).where(EvidenceFile.case_id == case.id, EvidenceFile.sha256 == staged.sha256)).scalar_one()
        return dup, True, None

    job = jobs.enqueue(session, case_id=case.id, evidence_id=ev.id, stage=jobs.STAGE_VALIDATE, input_hash=ev.sha256,
                       params=jobs.PARAMS[jobs.STAGE_VALIDATE])
    audit.record(session, actor=actor, action="evidence_uploaded", case_id=case.id, target_type="evidence", target_id=ev.id,
                 details={"kind": kind, "sha256": ev.sha256, "size_bytes": ev.size_bytes, "synthetic": synthetic, "filename": ev.original_filename})
    return ev, False, job


def store_text_evidence(session: Session, settings: Settings, *, case: Case, text: str, name: str, kind: str, synthetic: bool, provenance: dict | None,
                        actor: str) -> tuple[EvidenceFile, bool, ProcessingJob | None]:
    """Store a typed text (e.g. a typed witness statement) exactly like an uploaded file: hashed, read-only, with an audit entry."""
    import io

    class _Upload:  # minimal stand-in for UploadFile
        def __init__(self, data: bytes, filename: str):
            self.file, self.filename = io.BytesIO(data), filename

    return ingest_upload(session, settings, case=case, upload=_Upload(text.encode("utf-8"), name), kind=kind, synthetic=synthetic,  # type: ignore[arg-type]
                         provenance=provenance, licence=None, actor=actor)
