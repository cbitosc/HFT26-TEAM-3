"""Plain-dict response builders (keeps the API shape explicit and stable)."""
from app.models import Case, EvidenceFile, ProcessingJob, SourceAnnotation, VideoMetadata, WitnessStatement


def _iso(value):
    return value.isoformat() if value is not None else None


def source_block(ev: EvidenceFile, ann: SourceAnnotation | None = None) -> dict:
    """Editable description. Filename, kind, and bytes stay on the evidence row."""
    role = ann.camera_role if ann is not None and ann.camera_role else (ev.kind if ev.kind in ("cctv", "dashcam", "other") else None)
    return {
        "source_id": ev.id,
        "display_name": None if ann is None else ann.display_name,
        "camera_role": role,
        "location_text": None if ann is None else ann.location_text,
        "recording_start": None if ann is None else _iso(ann.recording_start),
        "recording_end": None if ann is None else _iso(ann.recording_end),
        "timezone": None if ann is None else ann.timezone,
        "clock_offset_ms": None if ann is None else ann.clock_offset_ms,
        "clock_offset_reference_id": None if ann is None else ann.clock_offset_reference_id,
        "clock_offset_basis": None if ann is None else ann.clock_offset_basis,
        "original_filename": ev.original_filename,
        "processing_kind": ev.kind,
    }


def evidence_out(ev: EvidenceFile, vm: VideoMetadata | None = None, ann: SourceAnnotation | None = None) -> dict:
    out = {
        "id": ev.id, "case_id": ev.case_id, "kind": ev.kind, "original_filename": ev.original_filename, "mime_type": ev.mime_type,
        "size_bytes": ev.size_bytes, "sha256": ev.sha256, "uploaded_at": ev.uploaded_at, "synthetic": ev.synthetic,
        "provenance": ev.provenance, "licence": ev.licence, "status": ev.status, "validation": ev.validation,
        "links": {"original": f"/api/v1/evidence/{ev.id}/original"},
    }
    if vm is not None and vm.playback_path:
        out["links"]["stream"] = f"/api/v1/evidence/{ev.id}/stream"
        out["links"]["frames"] = f"/api/v1/evidence/{ev.id}/frames"
    if vm is not None:
        out["video"] = {"duration_ms": vm.duration_ms, "fps_nominal": vm.fps_nominal, "fps_measured": vm.fps_measured, "width": vm.width,
                        "height": vm.height, "codec": vm.codec, "rotation": vm.rotation, "frame_count": vm.frame_count,
                        "pts_start_ms": vm.pts_start_ms, "playback_ready": bool(vm.playback_path),
                        "creation_time_claimed": vm.creation_time_claimed,
                        "note": "creation_time_claimed is embedded metadata, not a verified or synchronized time"}
    out["source"] = source_block(ev, ann)
    return out


def job_out(job: ProcessingJob) -> dict:
    return {"id": job.id, "case_id": job.case_id, "evidence_id": job.evidence_id, "stage": job.stage, "status": job.status,
            "progress": job.progress, "attempts": job.attempts, "error": job.error, "params": job.params, "result": job.result, "created_at": job.created_at,
            "started_at": job.started_at, "finished_at": job.finished_at}


INCIDENT_AT_NOTE = (
    "Investigator-stated instant. A timezone offset is required on write. "
    "The server does not assume one, does not read this from a file, and does not use it to choose frames."
)


def case_out(case: Case, counts: dict | None = None) -> dict:
    out = {"id": case.id, "code": case.code, "title": case.title, "description": case.description, "status": case.status,
           "designation": case.designation, "allow_external_inference": case.allow_external_inference,
           "incident_at": _iso(case.incident_at), "incident_at_note": INCIDENT_AT_NOTE, "location_text": case.location_text,
           "created_at": case.created_at, "updated_at": case.updated_at}
    if counts is not None:
        out["counts"] = counts
    return out


def statement_out(st: WitnessStatement) -> dict:
    return {"id": st.id, "witness_id": st.witness_id, "evidence_id": st.evidence_id, "text_original": st.text_original,
            "source": st.source, "statement_time": st.statement_time, "synthetic": st.synthetic}
