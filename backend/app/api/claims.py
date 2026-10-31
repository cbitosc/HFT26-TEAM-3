from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps import get_actor, get_case, get_factory
from app.api.serializers import job_out
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import AppError
from app.models import Case, ModelRun, Witness, WitnessClaim, WitnessStatement, Event, ReconstructionScenario, Contradiction, Corroboration, EvidenceFile, VideoMetadata
from app.services import audit, jobs
from app.services import witness as wit

router = APIRouter(tags=["claims"])
STATUS_NOTE = "Assessments refer to the latest baseline reconstruction. Update reconstruction after changing evidence or identity links."


def _statement(db: Session, statement_id: str) -> tuple[WitnessStatement, Case]:
    st = db.get(WitnessStatement, statement_id)
    if st is None:
        raise AppError(404, "STATEMENT_NOT_FOUND", f"No statement with id {statement_id}")
    return st, db.get(Case, db.get(Witness, st.witness_id).case_id)


def claim_out(c: WitnessClaim, text: str, assessment: dict | None = None) -> dict:
    n = c.normalized or {}
    return {
        "review_status": n.get("review_status", "needs_review"), "id": c.id, "statement_id": c.statement_id, "extraction_status": c.extraction_status, "model_run_id": c.model_run_id,
        # layer 1: what the witness actually said (verbatim, with position in the original statement)
        "explicit_statement": {"text": c.source_text, "char_start": c.char_start, "char_end": c.char_end,
                               "context_before": text[max(0, c.char_start - 40):c.char_start], "context_after": text[c.char_end:c.char_end + 40]},
        # layer 2: a machine's reading of it (never a fact)
        "normalized_interpretation": {"subject": c.subject, "action": c.action, "direction": c.direction, "location": n.get("location"),
                                      "time_description": c.time_description, "time_exactness": n.get("time_exactness", "none"),
                                      "certainty": c.certainty, "hedges": n.get("hedges", []), "event_type_hint": n.get("event_type_hint"),
                                      # read by code from the witness's own words; the engine relies on this, not on the model's direction field
                                      "code_derived_maneuver": n.get("code_derived_maneuver"), "direction_check": n.get("direction_check", "not_comparable"),
                                      "time_anchor": n.get("time_anchor"), "interpreted_by": n.get("interpretation_by", "investigator" if c.extraction_status == "manual" else None)},
        # layers 3 and 4: filled in by the engine
        "corroboration_status": "not_assessed", "contradiction_status": "not_assessed",
        "time_placement": "not_placed: approximate witness times are never turned into exact timestamps",
        **(assessment or {}),
    }


@router.post("/statements/{statement_id}/extract", status_code=202)
def extract(statement_id: str, background: BackgroundTasks, db: Session = Depends(get_db), settings: Settings = Depends(get_settings),
            factory: sessionmaker = Depends(get_factory), actor: str = Depends(get_actor)) -> dict:
    """Queue claim extraction with the hosted text model. Only for cases that allow external inference."""
    st, case = _statement(db, statement_id)
    if not case.allow_external_inference:
        raise AppError(403, "EXTERNAL_INFERENCE_DISABLED", "This case does not allow sending content to an external model. "
                       "Enter claims manually, or enable the case policy first.", {"manual_endpoint": f"/api/v1/statements/{st.id}/claims"})
    if not settings.featherless_configured:
        raise AppError(503, "LLM_NOT_CONFIGURED", "FEATHERLESS_API_KEY is not configured on the server")
    job = jobs.maybe_enqueue_claims(db, settings, case, st)
    audit.record(db, actor=actor, action="claim_extraction_requested", case_id=case.id, target_type="statement", target_id=st.id)
    db.commit()
    background.add_task(jobs.run_pending, factory, settings)
    return job_out(job)


def latest_model_run(db: Session, st: WitnessStatement) -> ModelRun | None:
    ids = {c.model_run_id for c in db.execute(select(WitnessClaim).where(WitnessClaim.statement_id == st.id)).scalars() if c.model_run_id}
    if not ids:
        return None
    return db.execute(select(ModelRun).where(ModelRun.id.in_(ids), ModelRun.stage == jobs.STAGE_CLAIMS)
                      .order_by(ModelRun.finished_at.desc())).scalars().first()


@router.get("/statements/{statement_id}/claims")
def list_claims(statement_id: str, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> dict:
    """Claims of the most recent extraction run plus all manual claims; the original statement text is returned alongside."""
    st, case = _statement(db, statement_id)
    run = latest_model_run(db, st)
    claims = [c for c in db.execute(select(WitnessClaim).where(WitnessClaim.statement_id == st.id).order_by(WitnessClaim.char_start)).scalars()
              if c.model_run_id is None or (run and c.model_run_id == run.id)]
    assessed = assessments(db, case.id)
    return {"statement_id": st.id, "text_original": st.text_original, "synthetic": st.synthetic,
            "extraction_run": {"id": run.id, "model_id": run.model_id, "status": run.status, "metrics": run.metrics} if run else None,
            "items": [claim_out(c, st.text_original, assessed.get(c.id)) for c in claims],
            "extraction": {"hosted_available": settings.featherless_configured and case.allow_external_inference, "local_available": True}, "note": STATUS_NOTE}


@router.get("/cases/{case_id}/claims")
def case_claims(case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    out = []
    assessed = assessments(db, case.id)
    for w in db.execute(select(Witness).where(Witness.case_id == case.id).order_by(Witness.label)).scalars():
        for st in db.execute(select(WitnessStatement).where(WitnessStatement.witness_id == w.id)).scalars():
            run = latest_model_run(db, st)
            for c in db.execute(select(WitnessClaim).where(WitnessClaim.statement_id == st.id).order_by(WitnessClaim.char_start)).scalars():
                if c.model_run_id is None or (run and c.model_run_id == run.id):
                    out.append(claim_out(c, st.text_original, assessed.get(c.id)) | {"witness": {"id": w.id, "label": w.label}})
    return {"items": out, "note": STATUS_NOTE}


class ManualClaim(BaseModel):
    """The server cuts the quote out of the stored statement, so a manual claim can never misquote the witness."""
    char_start: int = Field(ge=0)
    char_end: int = Field(gt=0)
    subject: str | None = Field(default=None, max_length=200)
    action: str | None = Field(default=None, max_length=120)
    direction: str | None = Field(default=None, max_length=60)
    location: str | None = Field(default=None, max_length=200)
    time_description: str | None = Field(default=None, max_length=200)
    time_exactness: Literal["exact", "approximate", "none"] = "none"
    certainty: Literal["reported_as_direct_observation", "hedged", "hearsay", "assumption"] = "reported_as_direct_observation"

    @model_validator(mode="after")
    def _order(self):
        if self.char_end <= self.char_start:
            raise ValueError("char_end must be greater than char_start")
        return self


@router.post("/statements/{statement_id}/claims", status_code=201)
def add_manual_claim(statement_id: str, body: ManualClaim, db: Session = Depends(get_db), actor: str = Depends(get_actor)) -> dict:
    st, case = _statement(db, statement_id)
    if body.char_end > len(st.text_original):
        raise AppError(422, "SPAN_OUT_OF_RANGE", f"The statement has {len(st.text_original)} characters", {"length": len(st.text_original)})
    quote = st.text_original[body.char_start:body.char_end]
    claim = WitnessClaim(statement_id=st.id, model_run_id=None, char_start=body.char_start, char_end=body.char_end, source_text=quote,
                         subject=body.subject, action=body.action, direction=body.direction, time_description=body.time_description,
                         certainty=body.certainty, extraction_status="manual",
                         normalized={"location": body.location, "time_exactness": body.time_exactness, "hedges": [],
                                     "event_type_hint": wit.event_type_hint(wit.ClaimCandidate(source_text=quote, action=body.action, direction=body.direction)),
                                     "code_derived_maneuver": wit.derive_maneuver(quote), "direction_check": wit.direction_check(body.direction, wit.derive_maneuver(quote)),
                                     "interpretation_by": f"investigator:{actor}"})
    db.add(claim)
    db.flush()
    audit.record(db, actor=actor, action="claim_added_manually", case_id=case.id, target_type="claim", target_id=claim.id,
                 details={"statement_id": st.id, "char_start": body.char_start, "char_end": body.char_end})
    db.commit()
    return claim_out(claim, st.text_original)


def assessments(db: Session, case_id: str) -> dict:
    scn = db.execute(select(ReconstructionScenario).where(ReconstructionScenario.case_id == case_id, ReconstructionScenario.is_baseline.is_(True))
                     .order_by(ReconstructionScenario.created_at.desc())).scalars().first()
    if not scn:
        return {}
    cons = list(db.execute(select(Contradiction).where(Contradiction.scenario_id == scn.id)).scalars())
    crbs = list(db.execute(select(Corroboration).where(Corroboration.scenario_id == scn.id)).scalars())
    out = {}
    for e in db.execute(select(Event).where(Event.scenario_id == scn.id, Event.category == "witness_claim")).scalars():
        cid = (e.observations or {}).get("claim_id")
        related = [c.id for c in cons if e.id in (c.event_a, c.event_b)]
        support = [c.id for c in crbs if e.id in c.events]
        out[cid] = {"scenario_id": scn.id, "event_id": e.id,
                    "contradiction_status": "potential_conflict" if related else "no_conflict_identified",
                    "corroboration_status": "supported" if support else "no_support_identified",
                    "assessment_refs": related + support, "time_placement": (e.observations or {}).get("time_placement"),
                    "assessment_note": "Absence of a finding does not mean this claim was verified or every comparison was possible."}
    return out


@router.post("/statements/{statement_id}/extract-local")
def extract_local(statement_id: str, db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    st, case = _statement(db, statement_id)
    existing = {(c.char_start, c.char_end) for c in db.execute(select(WitnessClaim).where(WitnessClaim.statement_id == st.id)).scalars()}
    added = 0
    for item in wit.local_candidates(st.text_original):
        if (item["char_start"], item["char_end"]) in existing:
            continue
        db.add(WitnessClaim(statement_id=st.id, model_run_id=None, extraction_status="valid",
                            **item))
        added += 1
    audit.record(db, actor=who, action="local_claim_extraction", case_id=case.id, target_type="statement", target_id=st.id,
                 details={"claims_added": added, "extractor": "keyword-v1"})
    db.commit()
    return {"claims_added": added, "method": "local keyword extraction", "review_required": True}


class ClaimAnchor(BaseModel):
    evidence_id: str
    start_ms: float = Field(ge=0, allow_inf_nan=False)
    end_ms: float = Field(ge=0, allow_inf_nan=False)
    uncertainty_ms: float = Field(ge=0, allow_inf_nan=False)
    basis: str = Field(min_length=3, max_length=500)

    @model_validator(mode="after")
    def order(self):
        if self.end_ms < self.start_ms:
            raise ValueError("End must be after start")
        return self


@router.put("/claims/{claim_id}/time-anchor")
def anchor_claim(claim_id: str, body: ClaimAnchor, db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    c = db.get(WitnessClaim, claim_id)
    if not c:
        raise AppError(404, "CLAIM_NOT_FOUND", "No such claim")
    st, case = _statement(db, c.statement_id)
    ev = db.get(EvidenceFile, body.evidence_id)
    if not ev or ev.case_id != case.id or ev.kind not in ("cctv", "dashcam", "sensor_csv"):
        raise AppError(422, "INVALID_ANCHOR_SOURCE", "Choose a video or sensor source in this case")
    video = db.get(VideoMetadata, ev.id)
    if video and video.duration_ms is not None and body.end_ms > video.duration_ms:
        raise AppError(422, "ANCHOR_OUTSIDE_RECORDING", "The time range extends beyond this recording")
    c.normalized = (c.normalized or {}) | {"time_anchor": body.model_dump() | {"declared_by": who}}
    audit.record(db, actor=who, action="claim_time_anchored", case_id=case.id, target_type="claim", target_id=c.id, details=body.model_dump())
    db.commit()
    return claim_out(c, st.text_original)


class ClaimReview(BaseModel):
    status: Literal["included", "excluded"]
    note: str = Field(min_length=3, max_length=500)


@router.patch("/claims/{claim_id}/review")
def review_claim(claim_id: str, body: ClaimReview, db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    c = db.get(WitnessClaim, claim_id)
    if not c:
        raise AppError(404, "CLAIM_NOT_FOUND", "No such claim")
    st, case = _statement(db, c.statement_id)
    c.normalized = (c.normalized or {}) | {"review_status": body.status, "review_note": body.note, "reviewed_by": who}
    audit.record(db, actor=who, action="claim_reviewed", case_id=case.id, target_type="claim", target_id=c.id, details=body.model_dump())
    db.commit()
    return claim_out(c, st.text_original)
