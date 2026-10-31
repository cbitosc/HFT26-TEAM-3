from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_actor, get_evidence
from app.db import get_db
from app.errors import AppError
from app.models import Camera, EvidenceFile, VideoMetadata
from app.services import audit, geometry

router = APIRouter(tags=["calibration"])


class RefPoint(BaseModel):
    image: list[float] = Field(min_length=2, max_length=2, description="pixel [x, y] in the video frame")
    ground: list[float] = Field(min_length=2, max_length=2, description="position on the flat ground plane, in `units`")


class CalibrationBody(BaseModel):
    points: list[RefPoint] = Field(min_length=4, max_length=60)
    units: str = Field(default="m", pattern=r"^(m|ft|mat_units)$")
    note: str | None = Field(default=None, max_length=500)


def _camera(db: Session, ev: EvidenceFile) -> Camera | None:
    vm = db.get(VideoMetadata, ev.id)
    return db.get(Camera, vm.camera_id) if vm and vm.camera_id else None


@router.post("/evidence/{evidence_id}/calibration", status_code=201)
def set_calibration(body: CalibrationBody, ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    """Fit a ground-plane homography from reference points. Without a valid calibration no pixel is ever turned into metres."""
    if ev.kind not in ("dashcam", "cctv"):
        raise AppError(400, "NOT_A_VIDEO", "Calibration applies to video evidence")
    vm = db.get(VideoMetadata, ev.id)
    if vm is None or not vm.width:
        raise AppError(409, "NOT_VALIDATED", "Video metadata is not available yet")
    if ev.kind == "dashcam":
        raise AppError(422, "MOVING_CAMERA", "A single homography is valid only for a fixed camera; dashcam footage cannot be calibrated this way")
    try:
        fit = geometry.fit_homography([p.model_dump() for p in body.points], vm.width, vm.height)
    except geometry.CalibrationError as exc:
        raise AppError(422, "CALIBRATION_INVALID", str(exc))
    fit |= {"units": body.units, "note": body.note, "calibrated_by": who}
    cam = _camera(db, ev) or Camera(case_id=ev.case_id, kind=ev.kind, label=f"{ev.kind}: {ev.original_filename}")
    cam.calibration, cam.calibration_error_px = fit, fit["rms_error_px"]
    db.add(cam)
    db.flush()
    vm.camera_id = cam.id
    audit.record(db, actor=who, action="camera_calibrated", case_id=ev.case_id, target_type="evidence", target_id=ev.id,
                 details={"quality": fit["quality"], "rms_ground": fit["rms_error_ground"], "points": fit["n_points"]})
    db.commit()
    return {"camera_id": cam.id} | {k: v for k, v in fit.items() if k != "H"} | {"H": fit["H"]}


@router.get("/evidence/{evidence_id}/calibration")
def get_calibration(ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db)) -> dict:
    cam = _camera(db, ev)
    if cam is None or not cam.calibration:
        return {"calibrated": False, "reason": "no calibration: trajectories for this camera stay in image pixels"}
    return {"calibrated": True, "camera_id": cam.id} | cam.calibration
