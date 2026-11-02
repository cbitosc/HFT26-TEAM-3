import secrets
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_actor, get_case
from app.api.serializers import case_out
from app.db import get_db
from app.errors import AppError
from app.models import Case, EvidenceFile, InvestigationFinding, ProcessingJob
from app.services import audit
from app.services.jobs import ACTIVE

router = APIRouter(tags=["cases"])


class CaseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    designation: Literal["real", "staged", "synthetic", "mixed"]
    allow_external_inference: bool = False
    code: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{3,40}$")
    incident_at: datetime | None = None
    location_text: str | None = Field(default=None, max_length=500)


class CasePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    status: Literal["open", "processing", "review", "closed"] | None = None
    allow_external_inference: bool | None = None
    incident_at: datetime | None = None
    location_text: str | None = Field(default=None, max_length=500)


def _require_timezone(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        raise AppError(422, "INCIDENT_TIMEZONE_REQUIRED", "incident_at must include a timezone offset. The server does not assume one.")
    return value


def case_counts(db: Session, case_id: str) -> dict:
    ev = dict(db.execute(select(EvidenceFile.status, func.count()).where(EvidenceFile.case_id == case_id).group_by(EvidenceFile.status)).all())
    active = db.execute(select(func.count()).select_from(ProcessingJob).where(ProcessingJob.case_id == case_id, ProcessingJob.status.in_(ACTIVE))).scalar()
    failed = db.execute(select(func.count()).select_from(ProcessingJob).where(ProcessingJob.case_id == case_id, ProcessingJob.status == "failed")).scalar()
    open_findings = db.execute(select(func.count()).select_from(InvestigationFinding).where(
        InvestigationFinding.case_id == case_id, InvestigationFinding.review_status == "unreviewed")).scalar()
    return {"evidence_total": sum(ev.values()), "evidence_valid": ev.get("valid", 0), "evidence_invalid": ev.get("invalid", 0),
            "evidence_pending": ev.get("uploaded", 0), "jobs_active": active, "jobs_failed": failed, "findings_unreviewed": open_findings}


@router.post("/cases", status_code=201)
def create_case(body: CaseCreate, db: Session = Depends(get_db), actor: str = Depends(get_actor)) -> dict:
    for _ in range(5):
        code = body.code or f"TL-{secrets.token_hex(3).upper()}"
        case = Case(code=code, title=body.title, description=body.description, designation=body.designation,
                    allow_external_inference=body.allow_external_inference, incident_at=_require_timezone(body.incident_at),
                    location_text=body.location_text)
        db.add(case)
        try:
            db.flush()
        except IntegrityError as exc:
            db.rollback()
            constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
            # Only a case-code uniqueness collision should be retried. Other constraints are database errors.
            if constraint != "cases_code_key":
                raise
            if body.code:
                raise AppError(409, "CASE_CODE_TAKEN", f"Case code {body.code} is already used")
            continue
        audit.record(db, actor=actor, action="case_created", case_id=case.id, target_type="case", target_id=case.id,
                     details={"designation": case.designation, "allow_external_inference": case.allow_external_inference})
        db.commit()
        return case_out(case, case_counts(db, case.id))
    raise AppError(500, "CASE_CODE_GENERATION_FAILED", "Could not generate a unique case code")


@router.get("/cases")
def list_cases(status: Literal["open", "processing", "review", "closed"] | None = None, limit: int = Query(50, ge=1, le=200),
               db: Session = Depends(get_db)) -> dict:
    q = select(Case).order_by(Case.created_at.desc()).limit(limit)
    if status:
        q = q.where(Case.status == status)
    return {"items": [case_out(c, case_counts(db, c.id)) for c in db.execute(q).scalars()]}


@router.get("/cases/{case_id}")
def get_case_detail(case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    return case_out(case, case_counts(db, case.id))


@router.patch("/cases/{case_id}")
def patch_case(body: CasePatch, case: Case = Depends(get_case), db: Session = Depends(get_db), actor: str = Depends(get_actor)) -> dict:
    changes = body.model_dump(exclude_unset=True)
    if "incident_at" in changes:
        changes["incident_at"] = _require_timezone(changes["incident_at"])
    before = {k: getattr(case, k) for k in changes}
    for k, v in changes.items():
        setattr(case, k, v)
    if changes:
        audit.record(db, actor=actor, action="case_updated", case_id=case.id, target_type="case", target_id=case.id,
                     details={k: f"{before[k]} -> {changes[k]}" for k in changes if k != "description"})
    db.commit()
    return case_out(case, case_counts(db, case.id))
