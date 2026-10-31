from fastapi import Depends, Header
from sqlalchemy.orm import Session, sessionmaker

from app.db import get_db, get_session_factory
from app.errors import AppError
from app.models import Case, EvidenceFile


def get_actor(x_actor: str | None = Header(default=None)) -> str:
    """Who is acting. Real authentication is not part of the hackathon scope; the header attributes audit entries."""
    cleaned = "".join(c for c in (x_actor or "") if c.isalnum() or c in "._@- ")[:64].strip()
    return cleaned or "local-investigator"


def get_factory() -> sessionmaker[Session]:
    return get_session_factory()


def get_case(case_id: str, db: Session = Depends(get_db)) -> Case:
    case = db.get(Case, case_id)
    if case is None:
        raise AppError(404, "CASE_NOT_FOUND", f"No case with id {case_id}")
    return case


def get_evidence(evidence_id: str, db: Session = Depends(get_db)) -> EvidenceFile:
    ev = db.get(EvidenceFile, evidence_id)
    if ev is None:
        raise AppError(404, "EVIDENCE_NOT_FOUND", f"No evidence with id {evidence_id}")
    return ev
