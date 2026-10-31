import json
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_actor, get_case
from app.db import get_db
from app.errors import AppError
from app.models import Actor, ActorLink, Case, VehicleTrack, EvidenceFile, SensorSource, WitnessClaim, WitnessStatement, Witness, Event, ExtractedFrame, ModelRun, VideoMetadata
from app.config import Settings, get_settings
from app.llm.featherless import LlmError, NotConfigured, PolicyBlocked, make_client
from app.services import actor_labels, audit
from app.storage import safe_resolve

router = APIRouter(tags=["actors"])


class ActorCreate(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    kind: Literal["vehicle", "pedestrian", "cyclist", "other"] = "vehicle"
    attributes: dict = Field(default_factory=dict, description="e.g. {'color': 'blue', 'type': 'car', 'ego': true}")


def actor_out(a: Actor) -> dict:
    return {"id": a.id, "case_id": a.case_id, "label": a.label, "kind": a.kind, "attributes": a.attributes or {}}


def link_out(l: ActorLink) -> dict:
    return {"id": l.id, "actor_id": l.actor_id, "ref_type": l.ref_type, "ref_id": l.ref_id, "status": l.status, "basis": l.basis,
            "decided_by": l.decided_by, "decided_at": l.decided_at}


@router.post("/cases/{case_id}/actors", status_code=201)
def create_actor(body: ActorCreate, case: Case = Depends(get_case), db: Session = Depends(get_db), actor: str = Depends(get_actor)) -> dict:
    a = Actor(case_id=case.id, label=body.label, kind=body.kind, attributes=body.attributes)
    db.add(a)
    db.flush()
    audit.record(db, actor=actor, action="actor_created", case_id=case.id, target_type="actor", target_id=a.id)
    db.commit()
    return actor_out(a)


@router.get("/cases/{case_id}/actors")
def list_actors(case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    items = db.execute(select(Actor).where(Actor.case_id == case.id).order_by(Actor.label)).scalars().all()
    links = db.execute(select(ActorLink).where(ActorLink.actor_id.in_([a.id for a in items]))).scalars().all() if items else []
    return {"items": [actor_out(a) | {"links": [link_out(l) for l in links if l.actor_id == a.id]} for a in items]}


class LabelSuggestionRequest(BaseModel):
    evidence_id: str | None = None
    event_id: str | None = None


@router.post("/cases/{case_id}/actors/suggest-labels")
def suggest_labels(body: LabelSuggestionRequest, case: Case = Depends(get_case), db: Session = Depends(get_db),
                   settings: Settings = Depends(get_settings), who: str = Depends(get_actor)) -> dict:
    """Use Featherless vision on annotated frames around one candidate accident event. Suggestions remain candidate identity links."""
    if not case.allow_external_inference:
        raise AppError(409, "EXTERNAL_INFERENCE_DISABLED", "Enable external AI for this case before sending accident frames to Featherless")
    if not settings.featherless_configured:
        raise AppError(503, "FEATHERLESS_NOT_CONFIGURED", "Set FEATHERLESS_API_KEY on the backend")
    evidence = db.get(EvidenceFile, body.evidence_id) if body.evidence_id else db.execute(
        select(EvidenceFile).where(EvidenceFile.case_id == case.id, EvidenceFile.kind.in_(("cctv", "dashcam"))).order_by(EvidenceFile.uploaded_at)
    ).scalars().first()
    if evidence is None or evidence.case_id != case.id or evidence.kind not in ("cctv", "dashcam"):
        raise AppError(422, "VIDEO_REQUIRED", "Choose a processed video from this case")
    event_query = select(Event).where(Event.case_id == case.id, Event.source_id == evidence.id, Event.event_type == "possible_collision")
    if body.event_id:
        event_query = event_query.where(Event.id == body.event_id)
    event = db.execute(event_query.order_by(Event.start_case_ms)).scalars().first()
    if event is None:
        raise AppError(409, "NO_ACCIDENT_EVENT", "No candidate accident event with related tracks is available for this video")
    track_ids = [int(x) for x in (event.observations or {}).get("track_ids", [])][:4]
    run = db.execute(select(ModelRun).where(ModelRun.case_id == case.id, ModelRun.input_sha256 == evidence.sha256,
                                            ModelRun.stage == "track", ModelRun.status.in_(("completed", "partially_completed")))
                     .order_by(ModelRun.finished_at.desc())).scalars().first()
    tracks = db.execute(select(VehicleTrack).where(VehicleTrack.model_run_id == run.id, VehicleTrack.track_id.in_(track_ids))).scalars().all() if run else []
    if not tracks:
        raise AppError(409, "TRACKS_REQUIRED", "The candidate event has no current video tracks to label")
    vm = db.get(VideoMetadata, evidence.id)
    center = int(event.start_case_ms or 0)
    target_times = [max(0, center-400), center, center+400]
    frames = []
    for target in target_times:
        frame = db.execute(select(ExtractedFrame).where(ExtractedFrame.evidence_id == evidence.id, ExtractedFrame.thumbnail_path.is_not(None))
                           .order_by(func.abs(ExtractedFrame.time_ms-target)).limit(1)).scalars().first()
        if frame and frame.id not in {f.id for f in frames}:
            frames.append(frame)
    content = [{"type":"text", "text":actor_labels.PROMPT + f"\nRequested track IDs: {sorted(t.track_id for t in tracks)}. Event time: {center} ms."}]
    for frame in frames:
        url = actor_labels.annotated_data_url(safe_resolve(settings.storage_path, frame.thumbnail_path), tracks, frame.time_ms, vm.width, vm.height)
        content.append({"type":"image_url", "image_url":{"url":url}})
    client = make_client(settings)
    try:
        result = client.chat(db, case=case, model=settings.featherless_vision_model, messages=[{"role":"user","content":content}],
                             purpose="track_label_suggestions", input_ref={"evidence_sha256":evidence.sha256,"event_id":event.id,
                             "frames":[f.frame_no for f in frames],"track_ids":sorted(t.track_id for t in tracks)},
                             response_format={"type":"json_object"}, max_tokens=700,
                             extra_body={"chat_template_kwargs":{"enable_thinking":False}} if settings.featherless_disable_thinking else None)
        suggestions = actor_labels.parse(result.content, {t.track_id for t in tracks})
    except (ValueError, json.JSONDecodeError) as exc:
        client.record_validation(db, result.call_id, False); db.commit()
        raise AppError(502, "INVALID_FEATHERLESS_OUTPUT", "Featherless returned labels that failed validation", {"reason":str(exc)})
    except (NotConfigured, PolicyBlocked, LlmError) as exc:
        raise AppError(503, "FEATHERLESS_UNAVAILABLE", str(exc))
    client.record_validation(db, result.call_id, True)
    stored=[]
    for suggestion in suggestions:
        track=next(t for t in tracks if t.track_id == suggestion["track_id"])
        link=db.execute(select(ActorLink).where(ActorLink.ref_type=="track", ActorLink.ref_id==track.id,
                                                ActorLink.status.in_(("candidate","confirmed")))).scalars().first()
        actor=db.get(Actor, link.actor_id) if link else None
        attrs={"ai_suggested_label":suggestion["label"],"label_origin":"featherless","model":settings.featherless_vision_model,
               "confidence":suggestion["confidence"],"uncertainty":suggestion["uncertainty"],"role":suggestion["role"],
               "object_type":suggestion["object_type"],"color":suggestion["color"],"evidence_id":evidence.id,
               "track_id":track.track_id,"event_id":event.id,"llm_call_id":result.call_id}
        if actor is None:
            actor=Actor(case_id=case.id,label=suggestion["label"],kind="pedestrian" if suggestion["object_type"]=="pedestrian" else "vehicle",attributes=attrs)
            db.add(actor); db.flush()
            link=ActorLink(actor_id=actor.id,ref_type="track",ref_id=track.id,status="candidate",
                           basis={"source":"featherless_visual_suggestion","model":settings.featherless_vision_model,"call_id":result.call_id})
            db.add(link); db.flush()
        else:
            actor.attributes=(actor.attributes or {}) | attrs
        stored.append(actor_out(actor) | {"track_ref":{"evidence_id":evidence.id,"track_id":track.track_id},"link_status":link.status})
    audit.record(db,actor=who,action="featherless_track_labels_suggested",case_id=case.id,target_type="event",target_id=event.id,
                 details={"evidence_id":evidence.id,"tracks":[s["track_ref"]["track_id"] for s in stored],"model":settings.featherless_vision_model})
    db.commit()
    return {"items":stored,"event_id":event.id,"evidence_id":evidence.id,"frames":[{"frame_no":f.frame_no,"time_ms":f.time_ms} for f in frames],
            "model":settings.featherless_vision_model,"note":"AI visual suggestions only; investigator confirmation is required."}


class LinkCreate(BaseModel):
    ref_type: Literal["track", "sensor_source", "claim"]
    ref_id: str = Field(min_length=1, max_length=64)
    status: Literal["candidate", "confirmed"] = "candidate"
    basis: dict = Field(default_factory=dict)


def validate_reference(db, a, ref_type, ref_id):
    if ref_type == "track":
        row = db.get(VehicleTrack, ref_id)
        ev = db.get(EvidenceFile, row.evidence_id) if row else None
        case_id = ev.case_id if ev else None
    elif ref_type == "sensor_source":
        row = db.get(SensorSource, ref_id)
        case_id = row.case_id if row else None
    else:
        row = db.get(WitnessClaim, ref_id)
        st = db.get(WitnessStatement, row.statement_id) if row else None
        w = db.get(Witness, st.witness_id) if st else None
        case_id = w.case_id if w else None
    if case_id != a.case_id:
        raise AppError(422, "INVALID_IDENTITY_REFERENCE", "Choose evidence from this case")


@router.post("/actors/{actor_id}/links", status_code=201)
def add_link(actor_id: str, body: LinkCreate, db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    """Identity decisions. 'confirmed' is an investigator's decision and is audited; contradiction rules use confirmed links only."""
    a = db.get(Actor, actor_id)
    if a is None:
        raise AppError(404, "ACTOR_NOT_FOUND", f"No actor with id {actor_id}")
    validate_reference(db, a, body.ref_type, body.ref_id)
    existing = db.execute(select(ActorLink).where(ActorLink.ref_type == body.ref_type, ActorLink.ref_id == body.ref_id,
                                                  ActorLink.status == "confirmed")).scalars().first()
    if existing and body.status == "confirmed" and existing.actor_id != a.id:
        raise AppError(409, "ALREADY_CONFIRMED", "This reference is already confirmed for another actor")
    same = db.execute(select(ActorLink).where(ActorLink.actor_id == a.id, ActorLink.ref_type == body.ref_type,
                                             ActorLink.ref_id == body.ref_id, ActorLink.status == body.status)).scalars().first()
    if same:
        return link_out(same)
    link = ActorLink(actor_id=a.id, ref_type=body.ref_type, ref_id=body.ref_id, status=body.status, basis=body.basis or {"source": "investigator"})
    if body.status == "confirmed":
        from datetime import datetime, timezone
        link.decided_by, link.decided_at = who, datetime.now(timezone.utc)
    db.add(link)
    db.flush()
    audit.record(db, actor=who, action=f"actor_link_{body.status}", case_id=a.case_id, target_type="actor_link", target_id=link.id,
                 details={"actor": a.id, "ref_type": body.ref_type, "ref_id": body.ref_id})
    db.commit()
    return link_out(link)


@router.post("/actor-links/{link_id}/{decision}")
def decide_link(link_id: str, decision: Literal["confirm", "reject"], db: Session = Depends(get_db), who: str = Depends(get_actor)) -> dict:
    from datetime import datetime, timezone
    link = db.get(ActorLink, link_id)
    if link is None:
        raise AppError(404, "LINK_NOT_FOUND", f"No link with id {link_id}")
    if decision == "confirm":
        validate_reference(db, db.get(Actor, link.actor_id), link.ref_type, link.ref_id)
        other = db.execute(select(ActorLink).where(ActorLink.ref_type == link.ref_type, ActorLink.ref_id == link.ref_id,
                                                  ActorLink.status == "confirmed", ActorLink.actor_id != link.actor_id)).scalars().first()
        if other:
            raise AppError(409, "ALREADY_CONFIRMED", "This reference is already confirmed for another actor")
    link.status = "confirmed" if decision == "confirm" else "rejected"
    link.decided_by, link.decided_at = who, datetime.now(timezone.utc)
    audit.record(db, actor=who, action=f"actor_link_{link.status}", case_id=db.get(Actor, link.actor_id).case_id, target_type="actor_link", target_id=link.id)
    db.commit()
    return link_out(link)
