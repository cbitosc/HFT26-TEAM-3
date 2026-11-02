"""Before, during, and after as references to stored frames.

Nothing here writes a JPEG, interpolates a time, or orders two cameras onto one strip.
incident_at is intentionally not an argument.
"""
from collections import defaultdict

NOTE = (
    "Each item cites stored extracted frames on one video. "
    "before and after are the nearest stored samples outside that event's source interval on the same file. "
    "They are not a measurement of the incident. Cameras are not interleaved. incident_at is not used."
)
VIDEO = {"video_cctv", "video_dashcam"}


def _ref(frame: dict) -> dict:
    path = frame.get("thumbnail_path")
    return {
        "evidence_id": frame["evidence_id"],
        "frame_id": frame["id"],
        "frame_no": frame["frame_no"],
        "time_ms": frame["time_ms"],
        "thumbnail_url": f"/api/v1/frames/{frame['id']}/image" if path else None,
        "full_url": f"/api/v1/frames/{frame['id']}/image?full=true" if path else None,
    }


def _interval(event: dict) -> list | None:
    raw = (event.get("observations") or {}).get("source_time_ms")
    if not isinstance(raw, (list, tuple)) or len(raw) < 1 or raw[0] is None:
        return None
    end = raw[1] if len(raw) > 1 and raw[1] is not None else raw[0]
    return [raw[0], end]


def _cited(event: dict) -> list[int]:
    raw = event.get("cited_frames")
    if raw is None:
        raw = (event.get("observations") or {}).get("frames") or []
    out = []
    for number in raw:
        if isinstance(number, bool) or not isinstance(number, int):
            continue
        if number not in out:
            out.append(number)
    return out


def build_storyboard(events: list[dict], frames: list[dict]) -> dict:
    by_evidence = defaultdict(list)
    for frame in frames:
        by_evidence[frame["evidence_id"]].append(frame)
    for rows in by_evidence.values():
        rows.sort(key=lambda frame: (frame["time_ms"], frame["frame_no"], frame["id"]))

    grouped, omitted = defaultdict(list), []
    for event in events:
        if event.get("source_type") not in VIDEO:
            omitted.append({"event_id": event["id"], "reason": "not_a_video_event"})
            continue
        if not event.get("source_id"):
            omitted.append({"event_id": event["id"], "reason": "no_source"})
            continue
        interval = _interval(event)
        if interval is None:
            omitted.append({"event_id": event["id"], "reason": "no_source_time"})
            continue
        grouped[event["source_id"]].append(_card(event, interval, by_evidence.get(event["source_id"], [])))
    strips = []
    for evidence_id in sorted(grouped):
        items = sorted(grouped[evidence_id], key=lambda item: (item["source_time_ms"][0], item["event_id"]))
        strips.append({"evidence_id": evidence_id, "items": items})
    omitted.sort(key=lambda row: row["event_id"])
    return {"ordering": "per_source_media_time", "note": NOTE, "strips": strips, "omitted": omitted}


def _card(event: dict, interval: list, frames: list[dict]) -> dict:
    start, end = interval
    by_no = {frame["frame_no"]: frame for frame in frames}
    cited = _cited(event)
    if cited:
        basis = "cited_frames"
        during = [_ref(by_no[number]) for number in cited if number in by_no]
    else:
        basis = "samples_inside_interval"
        during = [_ref(frame) for frame in frames if start <= frame["time_ms"] <= end]
    used = {item["frame_id"] for item in during}
    before = next((frame for frame in reversed(frames) if frame["time_ms"] < start and frame["id"] not in used), None)
    after = next((frame for frame in frames if frame["time_ms"] > end and frame["id"] not in used), None)
    missing = []
    if before is None:
        missing.append("before")
    if not during:
        missing.append("during")
    if after is None:
        missing.append("after")
    return {
        "event_id": event["id"],
        "event_type": event.get("event_type"),
        "title": event.get("title"),
        "evidence_id": event["source_id"],
        "source_time_ms": [start, end],
        "during_basis": basis,
        "before": None if before is None else _ref(before),
        "during": during,
        "after": None if after is None else _ref(after),
        "missing": missing,
    }
