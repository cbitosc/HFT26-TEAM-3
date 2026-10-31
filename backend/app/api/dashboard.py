from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.serializers import evidence_out
from app.db import get_db
from app.models import Case, EvidenceFile, InvestigationFinding, ProcessingJob

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)) -> dict:
    """Real counts only; an empty database returns zeros, never demo numbers."""
    cases = dict(db.execute(select(Case.status, func.count()).group_by(Case.status)).all())
    jobs = dict(db.execute(select(ProcessingJob.status, func.count()).group_by(ProcessingJob.status)).all())
    recent = db.execute(select(EvidenceFile).order_by(EvidenceFile.uploaded_at.desc()).limit(5)).scalars().all()
    needs_review = db.execute(select(func.count()).select_from(InvestigationFinding).where(InvestigationFinding.review_status == "unreviewed")).scalar()
    return {
        "cases": {"total": sum(cases.values()), "by_status": cases},
        "evidence": {"total": db.execute(select(func.count()).select_from(EvidenceFile)).scalar(),
                     "invalid": db.execute(select(func.count()).select_from(EvidenceFile).where(EvidenceFile.status == "invalid")).scalar()},
        "jobs": {"by_status": jobs, "in_progress": sum(jobs.get(s, 0) for s in ("pending", "validating", "processing"))},
        "findings_needing_review": needs_review,
        "recent_evidence": [evidence_out(e) for e in recent],
    }
