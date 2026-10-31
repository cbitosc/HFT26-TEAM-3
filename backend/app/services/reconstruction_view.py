"""Read-model helpers for clocks, evidence class, overlap, hypotheses, associations, and completeness.

Pure functions over plain values. They do not invent a time, a vehicle, or a probability.
"""
from collections import defaultdict
from datetime import datetime, timedelta

PLACEABLE = {"direct_observation", "derived_observation", "sensor_observed", "witness_reported"}
TRUSTED_CLOCK = {"declared_by_investigator", "simulation_clock"}


def evidence_class(category: str, source_type: str, source_id: str | None) -> str:
    if category == "witness_claim":
        return "witness_reported"
    if source_type == "sensor":
        return "sensor_observed"
    if category == "machine_detection":
        return "derived_observation"
    if category == "direct_observation" and source_type in ("video_cctv", "video_dashcam"):
        return "direct_observation"
    if category == "inference":
        return "system_inference"
    if not source_id:
        return "unknown"
    return "unknown"


def _pair(value) -> list | None:
    if not isinstance(value, (list, tuple)) or len(value) < 1 or value[0] is None:
        return None
    end = value[1] if len(value) > 1 and value[1] is not None else value[0]
    return [value[0], end]


def clocks_for(event: dict, ctx: dict) -> dict:
    """event keys: source_id, observations, start_ms, end_ms, provenance. ctx: pts, clocks, groups."""
    media = _pair((event.get("observations") or {}).get("source_time_ms"))
    pts_start = ctx.get("pts", {}).get(event.get("source_id"))
    container = [media[0] + pts_start, media[1] + pts_start] if media is not None and pts_start is not None else None
    wall = None
    rec = ctx.get("clocks", {}).get(event.get("source_id"))
    if media is not None and rec and rec.get("basis") in TRUSTED_CLOCK and rec.get("utc_zero") is not None:
        zero = rec["utc_zero"]
        if isinstance(zero, str):
            zero = datetime.fromisoformat(zero)
        wall = [(zero + timedelta(milliseconds=media[0])).isoformat(), (zero + timedelta(milliseconds=media[1])).isoformat()]
    case = None
    if event.get("start_ms") is not None:
        end = event["end_ms"] if event.get("end_ms") is not None else event["start_ms"]
        case = [event["start_ms"], end]
    group = (event.get("provenance") or {}).get("sync_group")
    info = (ctx.get("groups") or {}).get(group) if group else None
    synced = case if info and info.get("members", 0) >= 2 and info.get("consistent") else None
    return {"media_ms": media, "container_pts_ms": container, "wall_clock": wall, "case_ms": case, "synchronized_ms": synced}


def trace_for(event: dict, by_id: dict) -> dict:
    prov = event.get("provenance") or {}
    if event.get("category") == "inference":
        premises = ((event.get("inference") or {}).get("premises")) or []
        ids, complete = [], bool(premises)
        for pid in premises:
            other = by_id.get(pid)
            if other is None or not other.get("source_id"):
                complete = False
            elif other["source_id"] not in ids:
                ids.append(other["source_id"])
        return {"source_id": event.get("source_id"), "source_event_id": prov.get("source_event_id"), "evidence_ids": ids, "complete": complete}
    sid = event.get("source_id")
    return {"source_id": sid, "source_event_id": prov.get("source_event_id"), "evidence_ids": [sid] if sid else [], "complete": bool(sid)}


def overlaps(events: list[dict]) -> list[dict]:
    """One record per pair of evidence ids whose placed case-time spans intersect. Not contact."""
    spans, members = {}, defaultdict(list)
    for event in events:
        if event.get("start_ms") is None or not event.get("source_id"):
            continue
        end = event["end_ms"] if event.get("end_ms") is not None else event["start_ms"]
        lo, hi = spans.get(event["source_id"], (event["start_ms"], end))
        spans[event["source_id"]] = (min(lo, event["start_ms"]), max(hi, end))
        members[event["source_id"]].append((event["id"], event["start_ms"], end))
    ids = sorted(spans)
    out = []
    for i, left in enumerate(ids):
        for right in ids[i + 1:]:
            lo, hi = max(spans[left][0], spans[right][0]), min(spans[left][1], spans[right][1])
            if lo <= hi:
                chosen = [eid for eid, start, end in members[left] + members[right] if start <= hi and end >= lo]
                out.append({"evidence_ids": [left, right], "start_ms": lo, "end_ms": hi, "event_ids": chosen})
    return out


def hypotheses(events: list[dict], by_id: dict) -> tuple[list[dict], list[str]]:
    """Stored inference alternatives. No probability. Incomplete premises are listed, not narrated."""
    ready, unsupported = [], []
    for event in events:
        if event.get("category") != "inference":
            continue
        info = event.get("inference") or {}
        traced = trace_for(event, by_id)
        if not traced["complete"]:
            unsupported.append(event["id"])
            continue
        ready.append({
            "id": event["id"], "evidence_class": "hypothesis", "statement": info.get("statement") or event.get("title"),
            "alternatives": list(info.get("alternatives") or []), "premises": list(info.get("premises") or []),
            "evidence_ids": traced["evidence_ids"], "probability": None,
        })
    return ready, unsupported


def associations_from_links(tracks: list[dict], links: list[dict], contradictions: list[dict], event_evidence: dict) -> list[dict]:
    """Confirmed actor links that span two evidence ids. Equal track_id integers are ignored."""
    by_pk = {t["pk"]: t for t in tracks}
    by_actor = defaultdict(list)
    for link in links:
        track = by_pk.get(link.get("ref_id"))
        if track is not None:
            by_actor[link["actor_id"]].append((link, track))
    out = []
    for pairs in by_actor.values():
        evidence_ids = {track["evidence_id"] for _, track in pairs}
        if len(evidence_ids) < 2:
            continue
        contradicting = []
        for row in contradictions:
            left, right = event_evidence.get(row["event_a"]), event_evidence.get(row["event_b"])
            if left in evidence_ids and right in evidence_ids and left != right:
                contradicting.append({"kind": "contradiction", "id": row["id"], "evidence_id": left})
        out.append({
            "status": "uncertain",
            "tracks": [{"evidence_id": track["evidence_id"], "track_id": track["track_id"], "track_pk": track["pk"]} for _, track in pairs],
            "supporting": [{"kind": "actor_link", "id": link["id"], "evidence_id": track["evidence_id"]} for link, track in pairs],
            "contradicting": contradicting,
            "basis": "Confirmed identity links name these tracks as one actor. The association stays uncertain. Track ids were not matched across cameras.",
            "probability": None,
        })
    return out


def group_index(solution: dict | None) -> dict:
    out = {}
    for group in (solution or {}).get("groups") or []:
        out[group.get("id")] = {"members": len(group.get("members") or []), "consistent": bool(group.get("consistent", True))}
    return out


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value)


def completeness(events: list[dict], by_id: dict, sources: list[dict], gaps: list[dict], track_count: int, unsynchronized: list[str],
                 annotations: dict, ctx: dict, contradiction_count: int = 0) -> dict:
    classes = {e["id"]: evidence_class(e.get("category"), e.get("source_type"), e.get("source_id")) for e in events}
    traced = {e["id"]: trace_for(e, by_id) for e in events}
    placed = [
        e for e in events
        if e.get("start_ms") is not None and traced[e["id"]]["complete"] and classes[e["id"]] in PLACEABLE
    ]
    gap_types = defaultdict(int)
    missing = []
    for gap in gaps:
        gap_types[gap["gap_type"]] += 1
        scope = gap.get("scope") or {}
        missing.append({"gap_id": gap["id"], "gap_type": gap["gap_type"], "evidence_id": scope.get("evidence_id")})
    _, unsupported = hypotheses(events, by_id)
    reasons = []
    if not placed:
        reasons.append("no_placed_evidence")
    videos = [s for s in sources if s["kind"] in ("cctv", "dashcam") and s.get("status") == "valid"]
    if videos and track_count == 0:
        reasons.append("no_tracked_vehicles")
    if unsynchronized:
        reasons.append("sources_unsynchronized")
    if gap_types.get("clock_inconsistency"):
        reasons.append("clock_inconsistency")
    if gap_types.get("video_missing_interval") or gap_types.get("sensor_missing_interval"):
        reasons.append("missing_intervals")
    for event in events:
        wall = clocks_for(event, ctx)["wall_clock"]
        note = annotations.get(event.get("source_id"))
        if not wall or not note:
            continue
        instant = _parse_time(wall[0])
        start, end = note.get("recording_start"), note.get("recording_end")
        if start is not None and instant < start:
            if "recording_starts_after_event" not in reasons:
                reasons.append("recording_starts_after_event")
        if end is not None and instant > end:
            if "recording_ends_before_event" not in reasons:
                reasons.append("recording_ends_before_event")
    placed_ids = {e.get("source_id") for e in events if e.get("start_ms") is not None and e.get("source_id")}
    unsync = set(unsynchronized or [])
    return {
        "defensible": bool(placed),
        "reasons": reasons,
        "sources": [
            {"evidence_id": s["id"], "kind": s["kind"], "placed": s["id"] in placed_ids, "unsynchronized": s["id"] in unsync}
            for s in sources
        ],
        "gap_types": dict(gap_types),
        "contradiction_count": contradiction_count,
        "missing_evidence": missing,
        "unsupported_hypotheses": unsupported,
        "overlaps": overlaps(events),
    }
