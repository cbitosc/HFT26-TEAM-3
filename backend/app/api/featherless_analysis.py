"""Opt-in Featherless analysis layered over, never replacing, the stored reconstruction."""
import json

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_actor, get_case
from app.api.reconstruction import get_scenario
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import AppError
from app.llm.featherless import LlmError, NotConfigured, PolicyBlocked, make_client
from app.models import Case, EvidenceFile, ExtractedFrame, LlmCall, ModelRun, VehicleTrack, VideoMetadata, Witness, WitnessStatement
from app.services import actor_labels, audit, featherless_analysis as fa, incident
from app.storage import safe_resolve

router=APIRouter(tags=["featherless"])


def _extra(settings):
    return {"chat_template_kwargs":{"enable_thinking":False}} if settings.featherless_disable_thinking else None


def _latest(db,case_id):
    rows=db.execute(select(LlmCall).where(LlmCall.provider=="featherless",LlmCall.valid.is_(True),LlmCall.error.is_(None)).order_by(LlmCall.id.desc()).limit(100)).scalars()
    for row in rows:
        meta=row.request_meta or {}; ref=meta.get("input_ref") or {}
        if meta.get("purpose")=="case_evidence_comparison" and ref.get("case_id")==case_id:
            bundle=ref.get("bundle")
            if not isinstance(bundle,dict):
                continue
            comparison=fa._json((row.response or {}).get("content", "{}"))
            return bundle | {"findings":comparison.get("findings",[]),"comparison_call_id":row.id}
    return None


@router.get("/cases/{case_id}/featherless-analysis")
def read(case:Case=Depends(get_case),db:Session=Depends(get_db)):
    item=_latest(db,case.id)
    return {"status":"ready","analysis":item} if item else {"status":"not_generated","analysis":None}


@router.post("/cases/{case_id}/featherless-analysis")
def generate(case:Case=Depends(get_case),db:Session=Depends(get_db),settings:Settings=Depends(get_settings),who:str=Depends(get_actor)):
    if not case.allow_external_inference: raise AppError(409,"EXTERNAL_INFERENCE_DISABLED","Enable external inference for this case first")
    scenario=get_scenario(db,case,None)
    view=incident.view_for_scenario(db,scenario)
    video=db.execute(select(EvidenceFile).where(EvidenceFile.case_id==case.id,EvidenceFile.kind.in_(("cctv","dashcam"))).order_by(EvidenceFile.uploaded_at)).scalars().first()
    vm=db.get(VideoMetadata,video.id) if video else None
    if not video or not vm or not vm.duration_ms: raise AppError(409,"VIDEO_REQUIRED","A processed video is required")
    run=db.execute(select(ModelRun).where(ModelRun.case_id==case.id,ModelRun.input_sha256==video.sha256,ModelRun.stage=="track",ModelRun.status.in_(("completed","partially_completed"))).order_by(ModelRun.finished_at.desc())).scalars().first()
    tracks=list(db.execute(select(VehicleTrack).where(VehicleTrack.model_run_id==run.id)).scalars()) if run else []
    allowed_tracks={t.track_id for t in tracks}
    if not allowed_tracks: raise AppError(409,"TRACKS_REQUIRED","Run video detection and tracking before Featherless analysis")
    important=[x for x in view["items"] if x.get("evidence_id")==video.id and x.get("start_ms") is not None]
    times=sorted(set([0,vm.duration_ms//4,vm.duration_ms//2,3*vm.duration_ms//4,max(0,vm.duration_ms-1)]+[int(x["start_ms"]) for x in important if x.get("event_type") in ("possible_collision","potential_interaction","vehicle_slowing")]))[:10]
    frames=[]; content=[{"type":"text","text":fa.NARRATIVE_PROMPT+"\nVideo duration: %d ms. Supplied frames follow in chronological order."%vm.duration_ms}]
    for target in times:
        frame=db.execute(select(ExtractedFrame).where(ExtractedFrame.evidence_id==video.id,ExtractedFrame.thumbnail_path.is_not(None)).order_by(func.abs(ExtractedFrame.time_ms-target)).limit(1)).scalars().first()
        if not frame or frame.id in {f.id for f in frames}: continue
        nearby=[t for t in tracks if t.points and min(abs(int(p.get("time_ms",0))-frame.time_ms) for p in t.points)<=500]
        nearby=sorted(nearby,key=lambda t:t.mean_confidence or 0,reverse=True)[:6]
        content.append({"type":"text","text":f"Frame time {frame.time_ms} ms; visible YOLO tracks: {[{'track_id':t.track_id,'class':t.class_name} for t in nearby]}"})
        content.append({"type":"image_url","image_url":{"url":actor_labels.annotated_data_url(safe_resolve(settings.storage_path,frame.thumbnail_path),nearby,frame.time_ms,vm.width,vm.height)}})
        frames.append(frame)
    if not frames: raise AppError(409,"FRAMES_REQUIRED","No processed video frames are available for Featherless analysis")
    allowed_times={f.time_ms for f in frames}; client=make_client(settings)
    try:
        first=client.chat(db,case=case,model=settings.featherless_vision_model,messages=[{"role":"user","content":content}],purpose="grounded_video_narrative",
            input_ref={"case_id":case.id,"scenario_id":scenario.id,"video_sha256":video.sha256,"frames":[f.frame_no for f in frames]},response_format={"type":"json_object"},max_tokens=1800,extra_body=_extra(settings))
        narrative=fa.parse_narrative(first.content,duration_ms=vm.duration_ms,allowed_times=allowed_times,allowed_tracks=allowed_tracks); client.record_validation(db,first.call_id,True)
        main_tracks=[x for e in narrative["events"] for x in e["track_ids"]]; main_track=main_tracks[0] if main_tracks else next(iter(allowed_tracks))
        second=client.chat(db,case=case,model=settings.featherless_text_model,messages=[{"role":"system","content":fa.OBD_PROMPT},{"role":"user","content":json.dumps({"duration_ms":vm.duration_ms,"vehicle_track_id":main_track,"narrative":narrative})}],purpose="simulated_obd_generation",
            input_ref={"case_id":case.id,"narrative":narrative},response_format={"type":"json_object"},max_tokens=2200,extra_body=_extra(settings))
        obd=fa.parse_obd(second.content,duration_ms=vm.duration_ms,allowed_tracks=allowed_tracks); client.record_validation(db,second.call_id,True)
        witnesses=[]
        for witness in db.execute(select(Witness).where(Witness.case_id==case.id)).scalars():
            for statement in db.execute(select(WitnessStatement).where(WitnessStatement.witness_id==witness.id)).scalars():
                witnesses.append({"id":statement.id,"label":witness.label,"text":statement.text_original,"synthetic":statement.synthetic})
        bundle={"case_id":case.id,"scenario_id":scenario.id,"evidence_id":video.id,"model":settings.featherless_vision_model,"narrative":narrative,"simulated_obd":obd,
                "witnesses":witnesses,"frames":[{"frame_no":f.frame_no,"time_ms":f.time_ms} for f in frames],"generated_by":"featherless","fallback_preserved":True}
        allowed_refs={("video_narrative",e["id"]) for e in narrative["events"]}|{("witness",w["id"]) for w in witnesses}|{("simulated_obd","simulated_obd")}
        third=client.chat(db,case=case,model=settings.featherless_text_model,messages=[{"role":"system","content":fa.COMPARE_PROMPT},{"role":"user","content":json.dumps(bundle)}],purpose="case_evidence_comparison",
            input_ref={"case_id":case.id,"bundle":bundle},response_format={"type":"json_object"},max_tokens=1800,extra_body=_extra(settings))
        findings=fa.parse_findings(third.content,duration_ms=vm.duration_ms,allowed_refs=allowed_refs); client.record_validation(db,third.call_id,True)
        third_row=db.get(LlmCall,third.call_id)
        if third_row:
            prior=third_row.response or {}
            third_row.response={**prior,"content":json.dumps({"findings":findings})}
    except (ValueError,json.JSONDecodeError) as exc:
        if 'first' in locals(): client.record_validation(db,first.call_id,False)
        if 'second' in locals(): client.record_validation(db,second.call_id,False)
        if 'third' in locals(): client.record_validation(db,third.call_id,False)
        db.commit(); raise AppError(502,"FEATHERLESS_OUTPUT_INVALID",str(exc))
    except (PolicyBlocked,NotConfigured,LlmError) as exc:
        db.commit(); raise AppError(503,"FEATHERLESS_UNAVAILABLE",str(exc))
    db.commit()
    audit.record(db,actor=who,action="featherless_case_analysis_generated",case_id=case.id,target_type="scenario",target_id=scenario.id,details={"frames":len(frames),"events":len(narrative["events"]),"obd_rows":len(obd["records"]),"findings":len(findings)})
    db.commit()
    return {"status":"ready","analysis":bundle|{"findings":findings,"comparison_call_id":third.call_id}}


@router.get("/cases/{case_id}/featherless-analysis/obd.csv")
def download_obd(case:Case=Depends(get_case),db:Session=Depends(get_db)):
    item=_latest(db,case.id)
    if not item: raise AppError(404,"FEATHERLESS_ANALYSIS_NOT_FOUND","Generate Featherless analysis first")
    return Response(fa.obd_csv(item["simulated_obd"]),media_type="text/csv",headers={"Content-Disposition":'attachment; filename="SIMULATED_Featherless_OBD.csv"'})
