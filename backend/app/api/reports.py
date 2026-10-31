from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse, PlainTextResponse
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_actor, get_case
from app.api.reconstruction import get_scenario
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import AppError
from app.models import Case, Report
from app.services import audit, report as rep
from app.storage import safe_resolve

router = APIRouter(tags=["reports"])


class ReportBody(BaseModel):
    scenario_id: str | None = None
    format: Literal["full", "investigator"] = "full"


def list_format(content: dict | None) -> str:
    """List label. The stored document still says `investigator` or omits format for the 16-section dossier."""
    if (content or {}).get("format") == "investigator":
        return "executive"
    return "full"


def out(r: Report, full: bool = False) -> dict:
    return {"id": r.id, "case_id": r.case_id, "scenario_id": r.scenario_id, "version": r.version, "created_at": r.created_at, "validation": r.validation,
            "has_pdf": bool(r.pdf_path)} | ({"content": r.content} if full else {})


@router.post("/cases/{case_id}/reports", status_code=201)
def create(body: ReportBody, case: Case = Depends(get_case), db: Session = Depends(get_db), settings: Settings = Depends(get_settings), who: str = Depends(get_actor)) -> dict:
    """Assemble and validate a report from a reconstruction scenario. A report that fails validation is stored with its failed checks and is not offered as final."""
    scn = get_scenario(db, case, body.scenario_id)
    content = rep.build_investigator(db, case, scn, who) if body.format == "investigator" else rep.build(db, case, scn, who)
    validation = rep.validate(content)
    version = (db.execute(select(func.max(Report.version)).where(Report.case_id == case.id)).scalar() or 0) + 1
    r = Report(case_id=case.id, scenario_id=scn.id, version=version, content=content, validation=validation)
    db.add(r)
    db.flush()
    if validation["passed"]:
        d = settings.storage_path / "reports"
        d.mkdir(parents=True, exist_ok=True)
        rep.to_pdf(content, d / f"{r.id}.pdf")
        r.pdf_path = f"reports/{r.id}.pdf"
    audit.record(db, actor=who, action="report_generated", case_id=case.id, target_type="report", target_id=r.id, details={"version": version, "passed": validation["passed"]})
    db.commit()
    return out(r, full=True)


@router.get("/cases/{case_id}/reports")
def list_reports(case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    rows = db.execute(select(Report).where(Report.case_id == case.id).order_by(Report.version.desc())).scalars()
    return {"items": [out(r) | {"format": list_format(r.content)} for r in rows]}


def _get(db: Session, report_id: str) -> Report:
    r = db.get(Report, report_id)
    if r is None:
        raise AppError(404, "REPORT_NOT_FOUND", f"No report with id {report_id}")
    return r


@router.get("/reports/{report_id}")
def detail(report_id: str, db: Session = Depends(get_db)) -> dict:
    return out(_get(db, report_id), full=True)


@router.get("/reports/{report_id}/markdown", response_class=PlainTextResponse)
def markdown(report_id: str, db: Session = Depends(get_db)) -> str:
    return rep.to_markdown(_get(db, report_id).content)


@router.get("/reports/{report_id}/pdf")
def pdf(report_id: str, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> FileResponse:
    r = _get(db, report_id)
    if not r.pdf_path:
        raise AppError(409, "REPORT_NOT_VALID", "A PDF is produced only for reports that pass validation", {"validation": r.validation})
    return FileResponse(safe_resolve(settings.storage_path, r.pdf_path), media_type="application/pdf", filename=f"traceline-{r.id}.pdf")
