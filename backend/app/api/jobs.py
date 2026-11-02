from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps import get_actor, get_case, get_factory
from app.api.serializers import job_out
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import AppError
from app.models import Case, ProcessingJob
from app.services import jobs

router = APIRouter(tags=["jobs"])


def _job(db: Session, job_id: str) -> ProcessingJob:
    job = db.get(ProcessingJob, job_id)
    if job is None:
        raise AppError(404, "JOB_NOT_FOUND", f"No job with id {job_id}")
    return job


@router.get("/cases/{case_id}/jobs")
def list_jobs(status: str | None = None, case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    q = select(ProcessingJob).where(ProcessingJob.case_id == case.id).order_by(ProcessingJob.created_at.desc())
    if status:
        q = q.where(ProcessingJob.status == status)
    return {"items": [job_out(j) for j in db.execute(q).scalars()]}


@router.get("/jobs/{job_id}")
def job_detail(job_id: str, db: Session = Depends(get_db)) -> dict:
    return job_out(_job(db, job_id))


@router.post("/jobs/{job_id}/retry", status_code=202)
def retry_job(job_id: str, background: BackgroundTasks, db: Session = Depends(get_db), settings: Settings = Depends(get_settings),
              factory: sessionmaker = Depends(get_factory), actor: str = Depends(get_actor)) -> dict:
    job = _job(db, job_id)
    try:
        jobs.retry(db, job, actor)
    except ValueError as exc:
        raise AppError(409, "JOB_NOT_RETRYABLE", str(exc))
    db.commit()
    background.add_task(jobs.run_pending, factory, settings)
    return job_out(job)
