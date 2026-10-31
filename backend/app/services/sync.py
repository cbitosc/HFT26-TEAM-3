"""Clock synchronization. Pure functions over plain dicts.

A source joins a sync group only through a recorded basis: an edge (declared offset, simulation clock, frame correspondence,
verified manual sync point) or two clock records whose UTC zero points were declared by the investigator / come from a
simulation. Embedded metadata times, `proposed` edges and `rejected` edges never synchronize anything.

Convention: edge (a, b, offset): t_b = t_a + offset. Within a group, `case_ms = source_ms + offset_to_reference`.
Uncertainty adds linearly along a path (conservative). A cycle whose edges disagree is reported as an inconsistency.
"""
import hashlib
from collections import defaultdict, deque
from datetime import datetime

SYNC_VERSION = "1"
TRUSTED_CLOCK_BASES = {"declared_by_investigator", "simulation_clock"}
APPLIED_EDGE_STATUS = {"declared", "verified"}
KIND_ORDER = {"cctv": 0, "dashcam": 1, "sensor_csv": 2}


def group_id(members: list[str]) -> str:
    return "sg_" + hashlib.sha1(",".join(sorted(members)).encode()).hexdigest()[:10]


def implied_edges(clocks: list[dict]) -> list[dict]:
    """Edges between sources whose UTC zero points are both trusted: t_b = t_a + (zero_a - zero_b)."""
    trusted = [c for c in clocks if c["basis"] in TRUSTED_CLOCK_BASES and c.get("utc_zero") is not None]
    out = []
    for i, a in enumerate(trusted):
        for b in trusted[i + 1:]:
            za, zb = a["utc_zero"], b["utc_zero"]
            if isinstance(za, str):
                za, zb = datetime.fromisoformat(za), datetime.fromisoformat(zb)
            out.append({"id": f"clk:{a['evidence_id']}~{b['evidence_id']}", "a_evidence": a["evidence_id"], "b_evidence": b["evidence_id"],
                        "offset_ms": (za - zb).total_seconds() * 1000, "bound_ms": a["bound_ms"] + b["bound_ms"], "basis": "clock_records",
                        "status": "declared"})
    return out


def solve(evidence: list[dict], clocks: list[dict], edges: list[dict], reference: str | None = None, edge_offsets: dict | None = None,
          exclude_edges: set | None = None) -> dict:
    """evidence: [{id, kind}] ; edges: [{id, a_evidence, b_evidence, offset_ms, bound_ms, basis, status}] -> groups/unsynchronized/inconsistencies."""
    ids = {e["id"]: e for e in evidence}
    usable = [e for e in edges + implied_edges(clocks)
              if e["status"] in APPLIED_EDGE_STATUS and e["a_evidence"] in ids and e["b_evidence"] in ids and e["id"] not in (exclude_edges or set())]
    for e in usable:
        if edge_offsets and e["id"] in edge_offsets:
            e["offset_ms"] = edge_offsets[e["id"]]
    adj: dict[str, list] = defaultdict(list)
    for e in usable:
        adj[e["a_evidence"]].append((e["b_evidence"], e, +1))   # moving a -> b
        adj[e["b_evidence"]].append((e["a_evidence"], e, -1))   # moving b -> a

    seen: set[str] = set()
    groups, inconsistencies = [], []
    order = sorted(ids, key=lambda i: (KIND_ORDER.get(ids[i]["kind"], 9), i))
    for start in order:
        if start in seen or (not adj[start] and len(ids) > 1):  # a lone source is its own reference clock; among several it stays unrelated
            continue
        comp = []
        dq = deque([start])
        tmp = {start}
        while dq:  # connected component
            x = dq.popleft()
            comp.append(x)
            for y, _, _ in adj[x]:
                if y not in tmp:
                    tmp.add(y)
                    dq.append(y)
        ref = reference if reference in tmp else min(comp, key=lambda i: (KIND_ORDER.get(ids[i]["kind"], 9), i))
        off, bound, path = {ref: 0.0}, {ref: 0.0}, {ref: []}
        used: set[str] = set()
        dq = deque([ref])
        while dq:
            x = dq.popleft()
            for y, e, d in adj[x]:
                if y in off:
                    continue
                # t_R = t_x + off_x ; edge a->b: t_b = t_a + o.  moving along +1: off_y = off_x - o ; along -1: off_y = off_x + o
                off[y] = off[x] - d * e["offset_ms"]
                bound[y] = bound[x] + e["bound_ms"]
                path[y] = path[x] + [e["id"]]
                used.add(e["id"])
                dq.append(y)
        for e in usable:  # edges not on the tree close cycles: check agreement
            if e["id"] in used or e["a_evidence"] not in off or e["b_evidence"] not in off:
                continue
            predicted = off[e["a_evidence"]] - off[e["b_evidence"]]
            allowed = e["bound_ms"] + bound[e["a_evidence"]] + bound[e["b_evidence"]]
            resid = abs(e["offset_ms"] - predicted)
            if resid > allowed:
                inconsistencies.append({"group": group_id(comp), "edge": e["id"], "residual_ms": round(resid, 1), "allowed_ms": round(allowed, 1),
                                        "message": "this clock relation contradicts the other relations in the group"})
        seen |= set(comp)
        groups.append({"id": group_id(comp), "reference": ref, "consistent": not any(i["group"] == group_id(comp) for i in inconsistencies),
                       "members": [{"evidence_id": m, "offset_to_reference_ms": round(off[m], 3), "bound_ms": round(bound[m], 3), "path": path[m]} for m in
                                   sorted(comp, key=lambda i: (KIND_ORDER.get(ids[i]["kind"], 9), i))]})
    return {"groups": groups, "unsynchronized": sorted(i for i in ids if i not in seen), "inconsistencies": inconsistencies, "version": SYNC_VERSION,
            "edges_used": sorted({e["id"] for e in usable})}


def lookup(result: dict) -> dict:
    """evidence_id -> {group, offset, bound, consistent}"""
    out = {}
    for g in result["groups"]:
        for m in g["members"]:
            out[m["evidence_id"]] = {"group": g["id"], "offset": m["offset_to_reference_ms"], "bound": m["bound_ms"], "consistent": g["consistent"]}
    return out


def to_case_interval(lk: dict, evidence_id: str, t_start_ms: float, t_end_ms: float | None, own_uncertainty_ms: float) -> dict | None:
    """Case-time interval [lo, hi] and its group, or None if the source is not synchronized with anything."""
    m = lk.get(evidence_id)
    if m is None:
        return None
    u = m["bound"] + own_uncertainty_ms
    end = t_start_ms if t_end_ms is None else t_end_ms
    return {"group": m["group"], "start_ms": t_start_ms + m["offset"], "end_ms": end + m["offset"], "uncertainty_ms": u, "consistent": m["consistent"]}


def propose_anchor_edges(video_events: list[dict], sensor_events: list[dict], max_bound_ms: float = 500.0) -> list[dict]:
    """Suggest (never apply) clock relations by matching a video collision candidate with a sensor impact/collision event.

    Each event dict: {evidence_id, t_start_ms, t_end_ms, uncertainty_ms, id}. If several pairs per evidence pair exist the
    proposal lists the alternatives and the best pair is just the closest in duration, not a verdict."""
    props: dict[tuple, list] = defaultdict(list)
    for v in video_events:
        for s in sensor_events:
            if v["evidence_id"] == s["evidence_id"]:
                continue
            vt = (v["t_start_ms"] + v["t_end_ms"]) / 2
            st = (s["t_start_ms"] + s["t_end_ms"]) / 2
            props[(v["evidence_id"], s["evidence_id"])].append({"video_event": v["id"], "sensor_event": s["id"], "offset_ms": st - vt,
                                                                "bound_ms": v["uncertainty_ms"] + s["uncertainty_ms"] + max_bound_ms})
    out = []
    for (va, sa), cands in props.items():
        best = min(cands, key=lambda c: abs((c["bound_ms"])))
        out.append({"a_evidence": va, "b_evidence": sa, "offset_ms": best["offset_ms"], "bound_ms": best["bound_ms"], "basis": "anchor_proposal",
                    "status": "proposed", "note": f"video event {best['video_event']} matched with sensor event {best['sensor_event']}; "
                    f"{len(cands) - 1} alternative pairing(s). Proposal only: confirm after checking both sources.",
                    "evidence_refs": {"video_event": best["video_event"], "sensor_event": best["sensor_event"], "alternatives": [c for c in cands if c is not best][:5]}})
    return out
