"""Validation for Featherless narrative, simulated OBD, and evidence comparison outputs."""
import csv
import io
import json
import re


NARRATIVE_PROMPT = """Analyse these chronological road-scene frames using only the visible boxes and supplied YOLO track metadata.
Return JSON only: {"summary":"...","events":[{"timestamp_ms":0,"end_ms":0,"title":"short title","description":"visible action","track_ids":[1],"motion":"stopped|slow|steady|fast_relative|unclear","contact":"none_visible|possible|unclear","confidence":0.0,"uncertainty":"..."}]}.
Rules: timestamps must be from supplied frame times; never invent a road user absent from supplied tracks; never infer exact speed, identity, injury, fault, make, model or registration. Image overlap is not proof of physical contact. Use 'possible' or 'unclear' when contact cannot be visually established. Maximum 8 events."""

OBD_PROMPT = """Create a compact simulated OBD demo series from the supplied validated visual narrative.
Return JSON only: {"vehicle_track_id":1,"assumptions":["..."],"records":[{"timestamp_ms":0,"speed_kmh":0,"accel_mps2":0,"brake_pct":0}]}.
This is fictional test data, not measurement. The input contains required_timestamps_ms: return exactly one record for each supplied timestamp and no other timestamps. Use plausible smooth values, 0-160 km/h, acceleration -12 to 8 m/s², brake 0-100. Do not claim video-derived speed."""

COMPARE_PROMPT = """Compare a YOLO-grounded AI video narrative, fictional/user witness text, and explicitly simulated OBD records.
Return JSON only: {"findings":[{"type":"correlation|contradiction|gap","timestamp_ms":0,"title":"...","explanation":"...","source_refs":[{"kind":"video_narrative|witness|simulated_obd","id":"..."}],"confidence":0.0,"uncertainty":"..."}]}.
Only compare claims actually present in the input. Simulated OBD is a demo assumption, never independent real-world proof. A contradiction identifies disagreement but never decides which source is correct. Maximum 12 findings."""


def _json(content):
    raw = content.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.I)
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("model output must be an object")
    return value


def parse_narrative(content, *, duration_ms, allowed_times, allowed_tracks):
    data = _json(content)
    summary = str(data.get("summary", "")).strip()[:800]
    if not summary:
        raise ValueError("summary is required")
    rows = data.get("events")
    if not isinstance(rows, list) or not 1 <= len(rows) <= 8:
        raise ValueError("events must contain 1 to 8 items")
    result=[]
    for index,row in enumerate(rows):
        t=int(row.get("timestamp_ms")); end=int(row.get("end_ms",t))
        if not 0 <= t <= end <= duration_ms or min(abs(t-x) for x in allowed_times) > 600:
            raise ValueError("event timestamp is not grounded in a supplied frame")
        tracks=[int(x) for x in row.get("track_ids",[])]
        if any(x not in allowed_tracks for x in tracks):
            raise ValueError("event references an unknown track")
        motion=str(row.get("motion","unclear")); contact=str(row.get("contact","unclear"))
        if motion not in {"stopped","slow","steady","fast_relative","unclear"} or contact not in {"none_visible","possible","unclear"}:
            raise ValueError("unsupported motion or contact classification")
        confidence=float(row.get("confidence"));
        if not 0 <= confidence <= 1: raise ValueError("invalid confidence")
        result.append({"id":f"ai-video-{index+1}","timestamp_ms":t,"end_ms":end,"title":str(row.get("title","")).strip()[:120],
                       "description":str(row.get("description","")).strip()[:500],"track_ids":tracks,"motion":motion,"contact":contact,
                       "confidence":confidence,"uncertainty":str(row.get("uncertainty","")).strip()[:300]})
    if any(not x["title"] or not x["description"] for x in result): raise ValueError("event title and description are required")
    return {"summary":summary,"events":sorted(result,key=lambda x:x["timestamp_ms"]),"classification":"ai_visual_narrative"}


def parse_obd(content, *, duration_ms, allowed_tracks):
    data=_json(content); track=int(data.get("vehicle_track_id"))
    if track not in allowed_tracks: raise ValueError("OBD references an unknown track")
    rows=data.get("records")
    maximum=min(120, duration_ms // 1000 + 2)
    if not isinstance(rows,list) or not 2 <= len(rows) <= maximum: raise ValueError(f"OBD requires 2 to {maximum} rows for this video")
    out=[]; previous=-1
    for row in rows:
        t=int(row.get("timestamp_ms")); speed=float(row.get("speed_kmh")); accel=float(row.get("accel_mps2")); brake=float(row.get("brake_pct"))
        if t <= previous or not 0 <= t <= duration_ms or not 0 <= speed <= 160 or not -12 <= accel <= 8 or not 0 <= brake <= 100:
            raise ValueError("invalid simulated OBD row")
        previous=t; out.append({"timestamp_ms":t,"speed_kmh":round(speed,2),"accel_mps2":round(accel,3),"brake_pct":round(brake,1),"record_origin":"SIMULATED_DEMO"})
    return {"id":"simulated_obd","vehicle_track_id":track,"records":out,"assumptions":[str(x)[:240] for x in data.get("assumptions",[])][:8],
            "synthetic":True,"disclaimer":"Featherless-generated demo data; not measured from the video."}


def parse_findings(content, *, duration_ms, allowed_refs):
    data=_json(content); rows=data.get("findings")
    if not isinstance(rows,list) or len(rows)>12: raise ValueError("findings must contain at most 12 items")
    out=[]
    for index,row in enumerate(rows):
        kind=str(row.get("type")); t=row.get("timestamp_ms")
        if kind not in {"correlation","contradiction","gap"}: raise ValueError("unsupported finding type")
        if t is not None and not 0 <= int(t) <= duration_ms: raise ValueError("finding timestamp outside video")
        refs=[]
        for ref in row.get("source_refs",[]):
            key=(str(ref.get("kind")),str(ref.get("id")))
            if key not in allowed_refs: raise ValueError("finding references an unknown source")
            refs.append({"kind":key[0],"id":key[1]})
        if not refs: raise ValueError("finding requires a source reference")
        confidence=float(row.get("confidence"));
        if not 0 <= confidence <= 1: raise ValueError("invalid finding confidence")
        out.append({"id":f"ai-finding-{index+1}","type":kind,"timestamp_ms":None if t is None else int(t),"title":str(row.get("title","")).strip()[:160],
                    "explanation":str(row.get("explanation","")).strip()[:600],"source_refs":refs,"confidence":confidence,
                    "uncertainty":str(row.get("uncertainty","")).strip()[:300],"review_status":"unreviewed"})
    return out


def obd_csv(obd):
    buf=io.StringIO(); out=csv.DictWriter(buf,fieldnames=["timestamp_ms","speed_kmh","accel_mps2","brake_pct","record_origin"])
    out.writeheader(); out.writerows(obd["records"]); return buf.getvalue()
