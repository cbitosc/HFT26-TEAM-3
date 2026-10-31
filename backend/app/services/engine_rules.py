"""Reconstruction rules over canonical events (plain dicts, case time). Deterministic; no database, no model calls.

Event dict keys used here: id, category, event_type, actor_id, group, t_start, t_end (case ms or None), unc (ms), evidence_id,
source_type, camera_kind, observations, synthetic. Rules only compare events in the same synchronization group, only compare
what is comparable (same confirmed actor, comparable frame of reference), and say "insufficient" instead of guessing.

Nothing here decides which source is right, and nothing states fault.
"""
import re
from collections import defaultdict

RULES_VERSION = "2"
TOL_BRAKE_MS = 2000.0
TOL_COLLISION_MS = 1500.0
TOL_ACTION_MS = 2000.0
BRAKE_LEAD_MS = 3000.0
MANEUVER_WORD = {"left": "turned left", "right": "turned right", "straight": "continued straight"}
VIDEO_MANEUVER_WORD = {"left": "turn left", "right": "turn right", "straight": "continue straight"}
SPEED_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(km/?h|kph|mph)", re.I)
PED_RE = re.compile(r"\b(man|woman|pedestrian|child|person|cyclist|boy|girl|people)\b", re.I)


def span(e: dict) -> tuple[float, float] | None:
    if e.get("t_start") is None or e.get("group") is None:
        return None
    return e["t_start"] - e["unc"], (e["t_end"] if e.get("t_end") is not None else e["t_start"]) + e["unc"]


def near(a: dict, b: dict, tol: float) -> bool:
    sa, sb = span(a), span(b)
    return bool(sa and sb and a["group"] == b["group"] and sa[0] - tol <= sb[1] and sb[0] - tol <= sa[1])


def relation(a: dict, b: dict) -> str:
    sa, sb = span(a), span(b)
    if not sa or not sb:
        return "not comparable in time"
    if sa[0] <= sb[1] and sb[0] <= sa[1]:
        return "overlapping"
    gap = (sb[0] - sa[1]) if sb[0] > sa[1] else (sa[0] - sb[1])
    return f"{gap / 1000:.1f} s apart"


def _lab(ctx: dict, actor_id: str | None, fallback: str = "an unidentified party") -> str:
    return ctx["actors"].get(actor_id, {}).get("label", fallback) if actor_id else fallback


def _evidence_label(ctx: dict, evidence_id: str) -> str:
    return ctx["evidence_labels"].get(evidence_id, evidence_id)


def _independent(events: list[dict]) -> tuple[bool, str]:
    ids = {e["evidence_id"] for e in events}
    kinds = sorted({e["source_type"] for e in events})
    if len(ids) == len(events):
        return True, f"the events come from different evidence items ({', '.join(kinds)}); they share no file and no measurement"
    return False, "two of the events come from the same evidence item, so they are not independent"


def correlate(events: list[dict], ctx: dict) -> dict:
    """Returns {corroborations, contradictions, questions, inferences, compared_claims}."""
    out = {"corroborations": [], "contradictions": [], "questions": [], "inferences": [], "compared_claims": set()}
    by_type = defaultdict(list)
    for e in events:
        by_type[e["event_type"]].append(e)
    seen: set = set()

    def corroborate(rule, evs, text, rel):
        key = (rule, frozenset(e["id"] for e in evs))
        if key in seen or len({e["evidence_id"] for e in evs}) < 2:
            return
        seen.add(key)
        ind, why = _independent(evs)
        out["corroborations"].append({"rule_id": rule, "events": [e["id"] for e in evs], "independent": ind, "independence_reason": why,
                                      "temporal_relation": rel, "explanation_template": text})

    # ---- COR-BRAKE-01: braking recorded by a sensor, slowing seen on a fixed camera, braking reported by a witness (all for the same confirmed actor)
    for s in by_type["hard_braking"]:
        if s["source_type"] != "sensor" or not s["actor_id"]:
            continue
        videos = [v for v in by_type["vehicle_slowing"] + by_type["vehicle_stopped"] if v["actor_id"] == s["actor_id"] and v["camera_kind"] == "cctv" and near(s, v, TOL_BRAKE_MS)]
        claims = [c for c in by_type["vehicle_braked"] if c["category"] == "witness_claim" and c["actor_id"] == s["actor_id"] and near(s, c, TOL_BRAKE_MS)]
        for v in videos[:1]:
            evs = [s, v] + claims
            who = _lab(ctx, s["actor_id"])
            text = (f"{_evidence_label(ctx, s['evidence_id'])} records hard braking by {who}, and {_evidence_label(ctx, v['evidence_id'])} shows "
                    f"{who} apparently slowing ({relation(s, v)}, image space)" + (f"; {len(claims)} witness statement(s) also describe braking" if claims else "")
                    + ". Consistent with, not proof of, the same event.")
            corroborate("COR-BRAKE-01", evs, text, relation(s, v))
    for v in by_type["vehicle_slowing"] + by_type["vehicle_stopped"]:
        if v["camera_kind"] == "cctv" and v["actor_id"] is None and v["category"] == "machine_detection" and any(
                s["source_type"] == "sensor" and near(s, v, TOL_BRAKE_MS) for s in by_type["hard_braking"]):
            out["questions"].append({"text": f"A fixed camera shows {v['title'].split(' appears')[0]} slowing close in time to a sensor braking event, but the tracked vehicle is not confirmed as "
                                              "any known vehicle, so the two could not be compared.", "refs": [v["id"]], "event": v["id"]})

    # ---- COR-COLL-01: a collision candidate in video and an independent sensor impact signal
    impacts = by_type["collision_flag"] + [s for s in by_type["acceleration_spike"]]
    for v in by_type["possible_collision"]:
        hits = [s for s in impacts if s["source_type"] == "sensor" and near(s, v, TOL_COLLISION_MS)]
        if hits:
            others = [w for w in by_type["possible_collision"] if w is not v and near(w, v, TOL_COLLISION_MS) and w["evidence_id"] != v["evidence_id"]]
            text = (f"{_evidence_label(ctx, v['evidence_id'])} shows a possible collision between the tracked vehicles, and {_evidence_label(ctx, hits[0]['evidence_id'])} "
                    f"records a {'collision flag' if hits[0]['event_type'] == 'collision_flag' else 'sharp acceleration spike'} {relation(v, hits[0])}. "
                    "Consistent with an impact at about this time; the accident-cue model was not counted.")
            corroborate("COR-COLL-01", [v, hits[0]] + others[:1], text, relation(v, hits[0]))

    # ---- claims vs observations
    maneuvers = [m for m in by_type["vehicle_maneuver_observed"] if m["camera_kind"] == "cctv"]
    for c in events:
        if c["category"] != "witness_claim":
            continue
        o = c["observations"]
        derived = o.get("code_derived_maneuver")
        # Explicit denial vs an attributed human review of this same actor and interval.
        if o.get("fall_report") == "denied" and c.get("actor_id"):
            for v in by_type["rider_fall_observed"]:
                if v["category"] != "direct_observation" or not v["observations"].get("reviewed_by") or v.get("actor_id") != c["actor_id"] or not near(c, v, 0):
                    continue
                out["compared_claims"].add(c["id"])
                out["contradictions"].append({"rule_id":"CON-FALL-DENIAL-01","event_a":c["id"],"event_b":v["id"],"related":[],"strength":"clear",
                    "basis":{"witness_quote":o.get("quote"),"video_evidence":v["evidence_id"],"frames":v["source_ref"].get("frames"),
                             "review_method":"human-reviewed video observation, not an automated fall detector","time_compared":True},
                    "benign_explanations":["The witness may mean a different rider or interval.","The reviewer-assigned identity or visual interpretation may be incorrect."],
                    "unresolved_questions":["Do the witness and reviewer mean the same rider and interval?"],
                    "explanation_template":f"{c['witness_label']} says the motorcycle/rider did not fall. An attributed human review of the linked video records a rider fall in the same time window. Review the cited frames; this does not establish vehicle contact or fault."})
        # CON-ACTION-01 / COR-MANEUVER-01
        if derived in MANEUVER_WORD:
            if not c["actor_id"]:
                out["questions"].append({"text": f"{c['witness_label']}'s statement that someone {MANEUVER_WORD[derived]} could not be compared with the video: "
                                                 f"\"{o.get('subject') or 'the vehicle'}\" is not confirmed as any known vehicle.", "refs": [c["id"]], "event": c["id"]})
            else:
                cands = [m for m in maneuvers if m["actor_id"] == c["actor_id"]]
                placed = c.get("t_start") is not None
                for m in cands:
                    if placed and not near(c, m, TOL_ACTION_MS):
                        out["questions"].append({"text": f"{c['witness_label']}'s window for \"{o.get('time_description')}\" does not overlap the video movement of {_lab(ctx, c['actor_id'])}; not compared.",
                                                 "refs": [c["id"], m["id"]], "event": c["id"]})
                        continue
                    out["compared_claims"].add(c["id"])
                    vm = m["observations"]["maneuver"]
                    net = m["observations"].get("net_heading_change_deg", 0.0)
                    who = _lab(ctx, c["actor_id"])
                    cam = _evidence_label(ctx, m["evidence_id"])
                    tid = (m["observations"].get("track_ids") or ["?"])[0]
                    if vm == derived:
                        corroborate("COR-MANEUVER-01", [c, m], f"{c['witness_label']} states that {who} {MANEUVER_WORD[derived]}. {cam}'s track {tid} (confirmed as {who}) "
                                    f"appears to {VIDEO_MANEUVER_WORD[vm]} (net heading change {net:.0f}°, image space). Consistent with the statement; the witness and the camera are independent sources.",
                                    "witness time not compared" if not placed else relation(c, m))
                    else:
                        margin = (abs(net) - 30) if derived == "straight" else (30 - abs(net)) if vm == "straight" else 90
                        out["contradictions"].append({
                            "rule_id": "CON-ACTION-01", "event_a": c["id"], "event_b": m["id"], "related": [], "strength": "clear" if margin >= 15 else "marginal",
                            "basis": {"actor": c["actor_id"], "witness_maneuver": derived, "video_maneuver": vm, "net_heading_change_deg": net, "video_evidence": m["evidence_id"],
                                      "witness_quote": o.get("quote"), "frames": m["source_ref"].get("frames"), "claim_time_placed": placed, "time_compared": placed,
                                      "frame_of_reference": "fixed camera; left/right relative to the vehicle's own direction of travel; image space",
                                      "tolerances": {"turn_threshold_deg": 30, "clear_margin_deg": 15}, "identity": "witness description and video track both linked to the actor by an investigator"},
                            "benign_explanations": ["The witness may be describing a different moment than the one the camera shows.",
                                                    "The link between the witness's description and the tracked vehicle was made by an investigator and could be wrong.",
                                                    "A fixed camera sees the scene from one viewpoint; the witness saw it from another."],
                            "unresolved_questions": ["Which moment does the statement refer to?", "Do other cameras or the vehicle's sensors show the same movement?"],
                            "explanation_template": f"{c['witness_label']} states that {who} {MANEUVER_WORD[derived]}. {cam}'s track {tid} (confirmed as {who}) appears to "
                                                    f"{VIDEO_MANEUVER_WORD[vm]} (net heading change {net:.0f}°, image space). The system does not determine which account is correct."})
                if not cands:
                    out["questions"].append({"text": f"No fixed-camera movement record exists for {_lab(ctx, c['actor_id'])}, so {c['witness_label']}'s statement that they {MANEUVER_WORD[derived]} "
                                                     "could not be checked against video.", "refs": [c["id"]], "event": c["id"]})
        # CON-QTY-01: numeric speed claims vs sensor speed
        m_sp = SPEED_RE.search(o.get("quote", ""))
        if c["event_type"] == "vehicle_speed_claim":
            if not m_sp:
                out["questions"].append({"text": f"{c['witness_label']}'s speed description (\"{o.get('quote', '')[:80]}\") has no number, so it cannot be tested against sensor data.",
                                         "refs": [c["id"]], "event": c["id"]})
            elif c["actor_id"] and ctx["speeds"].get(c["actor_id"]):
                claimed = float(m_sp.group(1)) * {"km/h": 1 / 3.6, "kmh": 1 / 3.6, "kph": 1 / 3.6, "mph": 0.44704}[m_sp.group(2).lower()]
                series = [v for (t, v) in ctx["speeds"][c["actor_id"]] if c.get("t_start") is None or (c["t_start"] - 1000 <= t <= c["t_end"] + 1000)]
                if series:
                    out["compared_claims"].add(c["id"])
                    lo, hi = min(series), max(series)
                    sensor_ev = next((e for e in events if e["source_type"] == "sensor" and e["actor_id"] == c["actor_id"]), None)
                    if sensor_ev is not None and (claimed > hi * 1.25 + 1 or claimed < lo * 0.75 - 1):
                        out["contradictions"].append({
                            "rule_id": "CON-QTY-01", "event_a": c["id"], "event_b": sensor_ev["id"], "related": [],
                            "strength": "clear" if (claimed > hi * 1.5 + 1 or claimed < lo * 0.5 - 1) else "marginal",
                            "basis": {"claimed_mps": round(claimed, 2), "sensor_min_mps": round(lo, 2), "sensor_max_mps": round(hi, 2), "tolerance": "25% + 1 m/s"},
                            "benign_explanations": ["Estimating speed by eye is difficult.", "The statement may refer to a different moment or vehicle than the sensor recorded."],
                            "unresolved_questions": ["Which vehicle and which moment does the estimate refer to?"],
                            "explanation_template": f"{c['witness_label']} estimates {m_sp.group(0)} ({claimed:.1f} m/s). The sensor on {_lab(ctx, c['actor_id'])} recorded {lo:.1f}–{hi:.1f} m/s in the compared window. "
                                                    "The system does not determine which is correct."})
        # CON-COLL-CLAIM-01: contact with a pedestrian claimed
        if c["event_type"] == "collision_claim" and PED_RE.search(o.get("quote", "")):
            near_miss = [n for n in by_type["possible_near_miss"]]
            coll = [n for n in by_type["possible_collision"] if any(t["class"] == "pedestrian" for t in n.get("tracks", []))]
            if near_miss and not coll:
                n = near_miss[0]
                cover = [(ev, rng) for ev, rng in ctx["sensor_cover"].items() if rng[2] == n["group"] and rng[0] <= n["t_start"] - 500 and rng[1] >= n["t_end"] + 500]
                impact = [s for s in impacts if s["source_type"] == "sensor" and n["group"] == s["group"] and near(s, n, 3000)]
                if cover and not impact:
                    out["compared_claims"].add(c["id"])
                    out["contradictions"].append({
                        "rule_id": "CON-COLL-CLAIM-01", "event_a": c["id"], "event_b": n["id"], "related": [], "strength": "marginal",
                        "basis": {"claim": o.get("quote"), "video": "boxes of the car and the pedestrian never overlap in the image; the car's box stops short",
                                  "sensor": "no collision flag or acceleration spike during the interval, with the sensor recording throughout", "sensor_evidence": cover[0][0]},
                        "benign_explanations": ["Image-space overlap or its absence is not physical contact or distance.", "A sensor on the car may not register a light contact.",
                                                "The statement may describe a different moment."],
                        "unresolved_questions": ["Is there other footage from a different angle at the moment of closest approach?"],
                        "explanation_template": f"{c['witness_label']} states that contact occurred. The fixed camera shows the vehicle and the pedestrian without overlapping boxes, and the vehicle's sensor "
                                                "recorded no impact signal. This is weak evidence (absence of a signal) and does not establish that no contact occurred."})
            elif not near_miss:
                out["questions"].append({"text": f"{c['witness_label']} claims contact with a pedestrian, but no video event describes the vehicle and pedestrian together; the claim is untested.",
                                         "refs": [c["id"]], "event": c["id"]})

    # Entry-order disagreements: never equate entering the camera's scene with entering a junction.
    orders = []
    for c in events:
        o = c.get("observations") or {}
        labels = o.get("entry_order_labels")
        scope = o.get("entry_order_scope")
        if c["category"] != "witness_claim" or not labels or not scope:
            continue
        def resolve(label):
            choices = [aid for aid, a in ctx["actors"].items() if re.match(r"^" + re.escape(label) + r"(?:$|\s|[·:(—-])", a["label"], re.I)]
            return choices[0] if len(choices) == 1 else None
        first, second = map(resolve, labels)
        if not first or not second or first == second or c.get("actor_id") != first or span(c) is None:
            out["questions"].append({"text": "Entry order needs two unambiguous vehicle labels, a confirmed match for the first vehicle and an anchored time range before it can be compared.", "refs": [c["id"]], "event": c["id"]})
            continue
        orders.append((c, first, second, scope))
    for i, (c, first, second, scope) in enumerate(orders):
        for other, ofirst, osecond, oscope in orders[i+1:]:
            if first != osecond or second != ofirst or scope != oscope or not near(c, other, 0):
                continue
            if c["observations"].get("witness_id") == other["observations"].get("witness_id") or c["evidence_id"] == other["evidence_id"]:
                continue
            out["compared_claims"].update([c["id"], other["id"]])
            out["contradictions"].append({"rule_id": "CON-ORDER-01", "event_a": c["id"], "event_b": other["id"], "related": [], "strength": "clear",
                "basis": {"first_claim": c["observations"].get("quote"), "second_claim": other["observations"].get("quote"), "scope": scope,
                          "identity": "confirmed first-vehicle links and unambiguous case vehicle labels", "time_compared": True},
                "benign_explanations": ["The witnesses may mean different entry boundaries or different passes through the scene.", "Vehicle identity decisions could be incorrect."],
                "unresolved_questions": ["Do both witnesses mean the same entry boundary and the same pass?", "Does footage cover that boundary?"],
                "explanation_template": f"{c['witness_label']} reports {_lab(ctx, first)} before {_lab(ctx, second)}; {other['witness_label']} reports the reverse at the {scope} in overlapping time ranges. Neither account is established as correct."})
        if scope != "scene":
            continue
        entries = [e for e in by_type["vehicle_enters_scene"] if e["source_type"] in ("video_cctv", "video_dashcam") and e["group"] == c["group"] and near(c, e, 0)]
        for a in [e for e in entries if e["actor_id"] == first]:
            b = next((e for e in entries if e["actor_id"] == second and e["evidence_id"] == a["evidence_id"]), None)
            if not b or span(b)[1] >= span(a)[0]:
                continue
            out["compared_claims"].add(c["id"])
            out["contradictions"].append({"rule_id": "CON-ORDER-VIDEO-01", "event_a": c["id"], "event_b": a["id"], "related": [b["id"]], "strength": "marginal",
                "basis": {"witness_quote": c["observations"].get("quote"), "scope": "camera scene only", "first_observed": b["id"], "later_observed": a["id"], "time_compared": True},
                "benign_explanations": ["A track can start late because of occlusion or missed detection.", "The witness may mean a different scene boundary."],
                "unresolved_questions": ["Do the first detections correspond to actual scene entry?"],
                "explanation_template": f"{c['witness_label']} reports {_lab(ctx, first)} entered the scene first. The same camera first tracked {_lab(ctx, second)} earlier, outside timestamp uncertainty. First detection is not proof of actual entry."})

    # ---- inferences (registered rules; never premises for other inferences)
    colls = by_type["possible_collision"] + by_type["collision_flag"]
    for s in by_type["hard_braking"]:
        if s["source_type"] != "sensor" or not s["actor_id"]:
            continue
        later = [c for c in colls if c["group"] == s["group"] and s.get("t_start") is not None and c.get("t_start") is not None and 0 <= c["t_start"] - s["t_start"] <= BRAKE_LEAD_MS]
        if later:
            c = min(later, key=lambda x: x["t_start"])
            lead = (c["t_start"] - s["t_start"]) / 1000
            who = _lab(ctx, s["actor_id"])
            out["inferences"].append({"rule_id": "INF-BRAKE-PRIOR-01", "type": "possible_braking_before_impact", "premises": [s["id"], c["id"]], "actor_id": s["actor_id"], "group": s["group"],
                                      "t_start": s["t_start"], "t_end": c["t_start"], "unc": max(s["unc"], c["unc"]),
                                      "statement": f"{who} may have begun braking about {lead:.1f} s before the candidate collision time. This is an inference, not an established fact.",
                                      "alternatives": ["braking for the junction or traffic ahead", "braking for a hazard unrelated to the other party", "a routine slowing unrelated to the collision"]})
    return out


GAP_ADVICE = {
    "video_missing_interval": "Obtain the complete original file or other cameras covering this interval; the missing frames cannot be reconstructed from this footage.",
    "sensor_missing_interval": "Obtain the full sensor log or an independent record (e.g. an event data recorder) for this interval.",
    "unsynchronized_source": "Record how this source's clock relates to another source (a shared flash or impact, or a known clock offset) before comparing its times.",
    "clock_inconsistency": "Two clock relations disagree. Re-measure the offset or confirm which relation is correct.",
    "no_camera_calibration": "Measure at least four ground reference points visible in this camera's view and record them to enable metric trajectories.",
    "unconfirmed_vehicle_identity": "Review the tracked vehicles against the footage and confirm which vehicle each track shows.",
    "tracking_fragmentation": "Review the listed tracks; they may show the same vehicle interrupted by occlusion. Do not assume they are the same vehicle.",
    "low_visual_quality": "Request the original, uncompressed recording; this footage is dark or blurred and detections are less reliable.",
    "untestable_claim": "Ask the witness for specifics that can be checked (direction, time relative to a known event, a number).",
    "no_visual_coverage_at_candidate_collision": "No video covers the candidate collision moment. Seek other footage; do not infer what happened inside the gap.",
}


def find_gaps(facts: dict) -> list[dict]:
    gaps = []

    def add(gtype, scope, details, refs):
        gaps.append({"gap_type": gtype, "scope": scope, "details": details, "recommendation": GAP_ADVICE[gtype], "refs": refs})

    for ev_id, v in facts["videos"].items():
        times = v["times"]
        if len(times) > 3:
            steps = [b - a for a, b in zip(times, times[1:])]
            med = sorted(steps)[len(steps) // 2]
            for a, b in zip(times, times[1:]):
                if med > 0 and b - a > 2.5 * med:
                    add("video_missing_interval", {"evidence_id": ev_id, "from_ms": a, "to_ms": b, "case_from_ms": v["to_case"](a), "case_to_ms": v["to_case"](b)},
                        {"duration_ms": b - a, "normal_frame_step_ms": med, "label": v["label"]}, [ev_id])
        if v["brightness"] is not None and (v["brightness"] < 60 or (v["blur"] is not None and v["blur"] < 15)):
            add("low_visual_quality", {"evidence_id": ev_id}, {"mean_brightness": round(v["brightness"], 1), "median_sharpness": v["blur"] and round(v["blur"], 1), "label": v["label"],
                                                               "note": "heuristic thresholds: brightness < 60 or sharpness < 15"}, [ev_id])
        if v["static"] and not v["calibrated"]:
            add("no_camera_calibration", {"evidence_id": ev_id}, {"label": v["label"], "effect": "trajectories for this camera stay in image pixels"}, [ev_id])
    for e in facts["events"]:
        if e["event_type"] == "sensor_gap":
            add("sensor_missing_interval", {"evidence_id": e["evidence_id"], "case_from_ms": e["t_start"], "case_to_ms": e["t_end"]},
                {"duration_ms": e["observations"].get("duration_ms"), "label": facts["labels"].get(e["evidence_id"])}, [e["evidence_id"], e["id"]])
    for ev_id in facts["unsynchronized"]:
        add("unsynchronized_source", {"evidence_id": ev_id}, {"label": facts["labels"].get(ev_id), "effect": "its events keep their own time and are not ordered against other sources"}, [ev_id])
    for inc in facts["inconsistencies"]:
        add("clock_inconsistency", {"group": inc["group"], "edge": inc["edge"]}, inc, [inc["edge"]])
    tracks_unconfirmed = [t for t in facts["tracks"] if t["in_events"] and not t["actor_id"] and t["observations"] >= 5]
    if tracks_unconfirmed:
        add("unconfirmed_vehicle_identity", {"tracks": [{"evidence_id": t["evidence_id"], "track_id": t["track_id"], "class": t["class"], "candidates": t["candidates"]} for t in tracks_unconfirmed][:20]},
            {"count": len(tracks_unconfirmed)}, sorted({t["evidence_id"] for t in tracks_unconfirmed}))
    frag = [t for t in facts["tracks"] if t["reliability"] in ("fragmented", "id_switch_suspected") or t["continuations"]]
    if frag:
        add("tracking_fragmentation", {"tracks": [{"evidence_id": t["evidence_id"], "track_id": t["track_id"], "reliability": t["reliability"], "continuation_candidates": t["continuations"]} for t in frag][:20]},
            {"count": len(frag), "note": "continuation candidates are never merged automatically"}, sorted({t["evidence_id"] for t in frag}))
    # candidate collision without any visual coverage
    for c in [e for e in facts["events"] if e["event_type"] in ("collision_flag", "possible_collision") and e.get("t_start") is not None]:
        covered = any(v["covers"](c["t_start"] - 500, c["t_end"] + 500 if c.get("t_end") is not None else c["t_start"] + 500) for v in facts["videos"].values())
        if facts["videos"] and not covered:
            add("no_visual_coverage_at_candidate_collision", {"case_ms": c["t_start"]}, {"event": c["id"], "sources_checked": len(facts["videos"])}, [c["id"]])
    for c in facts["claims"]:
        if not c["compared"]:
            add("untestable_claim", {"claim_event": c["id"], "witness": c["witness_label"]}, {"quote": c["quote"][:160], "reasons": c["reasons"]}, [c["id"]])
    return gaps


def build_summary(e: dict, index: dict, corr: dict, questions: list, gaps: list, ctx: dict) -> dict:
    """Per-event incident summary assembled from stored records only (template text; no model)."""
    related = [x for x in index.values() if x["id"] != e["id"] and near(e, x, 1500)] if e.get("group") else []
    def item(x):
        return {"event_id": x["id"], "text": x["title"], "time_ms": x.get("t_start"), "source": _evidence_label(ctx, x["evidence_id"]) if x.get("evidence_id") else "reconstruction engine", "refs": [x["id"]]}
    pool = [e] + related
    detections = [item(x) | {"model": x["observations"].get("model"), "confidence": x["observations"].get("detection_confidence")} for x in pool if x["category"] == "machine_detection"]
    observations = [item(x) for x in pool if x["category"] == "direct_observation"]
    claims = [item(x) | {"witness": x.get("witness_label"), "quote": x["observations"].get("quote")} for x in pool if x["category"] == "witness_claim"]
    sensors = [item(x) for x in pool if x["source_type"] == "sensor"]
    inferences = [item(x) | {"alternatives": x["observations"].get("alternatives")} for x in pool if x["category"] == "inference"]
    mine = lambda ids: e["id"] in ids  # noqa: E731
    contradictions = [c for c in corr["contradictions"] if e["id"] in (c["event_a"], c["event_b"])]
    corroborations = [c for c in corr["corroborations"] if mine(c["events"])]
    status = []
    if contradictions:
        status += ["requires_review", "potential_contradiction"]
    if any(c["rule_id"] == "CON-ACTION-01" for c in contradictions):
        status.append("conflicting_accounts")
    if corroborations:
        status.append("independently_supported")
    if any(q["event"] == e["id"] for q in questions):
        status.append("insufficient_evidence_for_some_comparisons")
    uncertainty = []
    if e.get("group") is None:
        uncertainty.append("This event comes from a source that is not synchronized with any other; its time is its own.")
    else:
        uncertainty.append(f"Time is known to within ±{e['unc'] / 1000:.2f} s (clock relation and sampling).")
    o = e["observations"]
    if o.get("coordinate_frame") == "image_pixels":
        uncertainty.append("Positions and movement are in image pixels; no real-world distance or speed is implied.")
    if o.get("relative_to_moving_camera"):
        uncertainty.append("The camera was moving; image motion includes the camera's own movement.")
    if o.get("accident_cue_note"):
        uncertainty.append("The accident-cue model is a weak supporting signal and does not decide this event.")
    if e["category"] == "witness_claim":
        uncertainty.append("A witness statement is testimony; it is recorded, not verified.")
    if not e.get("actor_id") and e["category"] != "inference" and e["source_type"] != "sensor":
        uncertainty.append("The vehicle in this event is not confirmed as any known vehicle.")
    if any(g["gap_type"] == "video_missing_interval" and g["scope"].get("case_from_ms") is not None and e.get("t_start") is not None and g["scope"]["case_from_ms"] - 500 <= e["t_start"] <= g["scope"]["case_to_ms"] + 500 for g in gaps):
        uncertainty.append("This event is close to a missing video interval; what happened inside the gap is unknown.")
    return {"event_id": e["id"], "title": e["title"], "category": e["category"], "time": {"case_ms": e.get("t_start"), "end_ms": e.get("t_end"), "uncertainty_ms": e["unc"], "sync_group": e.get("group")},
            "involved_actors": sorted({a for a in [e.get("actor_id")] + list(o.get("actors", [])) if a}), "observations": observations, "detections": detections, "witness_claims": claims,
            "sensor_observations": sensors, "inferences": inferences,
            "contradictions": [{"id": c.get("id"), "rule_id": c["rule_id"], "explanation": c["explanation_template"], "strength": c["strength"]} for c in contradictions],
            "corroborations": [{"id": c.get("id"), "rule_id": c["rule_id"], "explanation": c["explanation_template"], "independent": c["independent"]} for c in corroborations],
            "status": status, "uncertainty": uncertainty, "open_questions": [q["text"] for q in questions if q["event"] == e["id"] or e["id"] in q.get("refs", [])],
            "synthetic": e["synthetic"]}
