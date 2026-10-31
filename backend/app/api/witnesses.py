import hashlib
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps import get_actor, get_case, get_factory
from app.api.serializers import statement_out
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import AppError
from app.models import Case, EvidenceFile, Witness, WitnessStatement
from app.services import audit, jobs
from app.services.ingest import ingest_upload, store_text_evidence
from app.storage import safe_resolve

router = APIRouter(tags=["witnesses"])


class WitnessCreate(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)


class StatementCreate(BaseModel):
    text: str = Field(min_length=1, max_length=100_000)
    synthetic: bool
    statement_time: datetime | None = None


def _witness(db: Session, witness_id: str) -> Witness:
    w = db.get(Witness, witness_id)
    if w is None:
        raise AppError(404, "WITNESS_NOT_FOUND", f"No witness with id {witness_id}")
    return w


@router.post("/cases/{case_id}/witnesses", status_code=201)
def create_witness(body: WitnessCreate, case: Case = Depends(get_case), db: Session = Depends(get_db), actor: str = Depends(get_actor)) -> dict:
    w = Witness(case_id=case.id, label=body.label, notes=body.notes)
    db.add(w)
    db.flush()
    audit.record(db, actor=actor, action="witness_created", case_id=case.id, target_type="witness", target_id=w.id)
    db.commit()
    return {"id": w.id, "case_id": w.case_id, "label": w.label, "notes": w.notes}


@router.get("/cases/{case_id}/witnesses")
def list_witnesses(case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    ws = db.execute(select(Witness).where(Witness.case_id == case.id).order_by(Witness.label)).scalars().all()
    return {"items": [{"id": w.id, "label": w.label, "notes": w.notes} for w in ws]}


@router.post("/witnesses/{witness_id}/statements", status_code=201)
def add_typed_statement(witness_id: str, body: StatementCreate, background: BackgroundTasks, db: Session = Depends(get_db),
                        settings: Settings = Depends(get_settings), factory: sessionmaker = Depends(get_factory), actor: str = Depends(get_actor)) -> dict:
    """The text is stored exactly as given (no trimming), because claim spans index into it."""
    w = _witness(db, witness_id)
    case = db.get(Case, w.case_id)
    # the typed text is also stored as hashed, read-only evidence so every claim can cite a source record
    ev, _dup, vjob = store_text_evidence(db, settings, case=case, text=body.text, name=f"statement_{w.label}.txt", kind="witness_text",
                                          synthetic=body.synthetic, provenance={"witness_id": w.id, "typed": True}, actor=actor)
    st = WitnessStatement(witness_id=w.id, evidence_id=ev.id, text_original=body.text, source="typed", statement_time=body.statement_time, synthetic=body.synthetic)
    db.add(st)
    db.flush()
    audit.record(db, actor=actor, action="statement_added", case_id=w.case_id, target_type="statement", target_id=st.id,
                 details={"source": "typed", "sha256": hashlib.sha256(body.text.encode()).hexdigest(), "synthetic": body.synthetic})
    queued = jobs.maybe_enqueue_claims(db, settings, case, st)
    db.commit()
    if queued or vjob:
        background.add_task(jobs.run_pending, factory, settings)
    return statement_out(st) | {"extraction_job": queued.id if queued else None}


@router.post("/witnesses/{witness_id}/statements/upload", status_code=201)
def add_uploaded_statement(witness_id: str, background: BackgroundTasks, file: UploadFile = File(...), synthetic: bool = Form(...),
                           db: Session = Depends(get_db), settings: Settings = Depends(get_settings),
                           factory: sessionmaker = Depends(get_factory), actor: str = Depends(get_actor)) -> dict:
    """A .txt statement: stored as evidence (hashed, read-only) and as the statement record."""
    w = _witness(db, witness_id)
    case = db.get(Case, w.case_id)
    ev, duplicate, job = ingest_upload(db, settings, case=case, upload=file, kind="witness_text", synthetic=synthetic,
                                       provenance={"witness_id": w.id}, licence=None, actor=actor)
    existing = db.execute(select(WitnessStatement).where(WitnessStatement.evidence_id == ev.id, WitnessStatement.witness_id == w.id)).scalar_one_or_none()
    if existing:
        db.commit()
        return {"duplicate": True, "statement": statement_out(existing)}
    try:
        text = safe_resolve(settings.storage_path, ev.stored_path).read_bytes().decode("utf-8-sig")
    except UnicodeDecodeError:
        raise AppError(422, "NOT_UTF8", "The statement file is not valid UTF-8 text")
    st = WitnessStatement(witness_id=w.id, evidence_id=ev.id, text_original=text, source="txt", synthetic=synthetic)
    db.add(st)
    db.flush()
    audit.record(db, actor=actor, action="statement_added", case_id=w.case_id, target_type="statement", target_id=st.id,
                 details={"source": "txt", "evidence_id": ev.id})
    queued = jobs.maybe_enqueue_claims(db, settings, case, st)
    db.commit()
    if job or queued:
        background.add_task(jobs.run_pending, factory, settings)
    return {"duplicate": duplicate, "statement": statement_out(st), "extraction_job": queued.id if queued else None}


@router.get("/witnesses/{witness_id}/statements")
def list_statements(witness_id: str, db: Session = Depends(get_db)) -> dict:
    w = _witness(db, witness_id)
    sts = db.execute(select(WitnessStatement).where(WitnessStatement.witness_id == w.id)).scalars().all()
    return {"items": [statement_out(s) for s in sts]}


@router.get("/statements/{statement_id}")
def get_statement(statement_id: str, db: Session = Depends(get_db)) -> dict:
    st = db.get(WitnessStatement, statement_id)
    if st is None:
        raise AppError(404, "STATEMENT_NOT_FOUND", f"No statement with id {statement_id}")
    return statement_out(st)
