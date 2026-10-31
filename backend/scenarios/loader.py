"""Load a generated synthetic scenario package into a case through the public API (so the same path a user takes is exercised).

`client` is anything with get/post/put returning responses with .json() (FastAPI TestClient or httpx.Client with base_url).

detections="oracle": boxes come from the synthetic world (labelled `oracle:` everywhere) - isolates the reconstruction logic from detector quality.
detections="model":  boxes come from the real detector (needs the pinned weights); this is the path whose accuracy matters for real footage.

Claims are annotated by hand below (manual extraction) so results do not depend on a language model; the LLM path is evaluated separately.
"""
import json
import time
from pathlib import Path

from scenarios import world

# witness no (1-based) -> [(substring of the statement, fields, actor key or None)]
CLAIMS = {
    "A_intersection_collision": {
        1: [("The blue car kept going straight through the junction", dict(subject="blue car", action="kept going straight", direction="straight"), "A"),
            ("the white car came out from the south", dict(subject="white car", action="came out from the south"), "B"),
            ("I think the blue car braked just before the impact", dict(subject="blue car", action="braked", time_description="just before the impact", time_exactness="approximate",
                                                                      certainty="hedged"), "A")],
        2: [("I saw the blue car turn left just before the collision", dict(subject="blue car", action="turn", direction="left", time_description="just before the collision",
                                                                           time_exactness="approximate"), "A"),
            ("The white car was moving very fast", dict(subject="white car", action="moving very fast"), "B")]},
    "B_rear_end": {
        1: [("The white car in front braked suddenly", dict(subject="white car", action="braked suddenly"), "L"),
            ("the blue car behind it could not stop in time", dict(subject="blue car", action="could not stop"), "F")],
        2: [("The blue car was going really fast", dict(subject="blue car", action="going really fast"), "F")]},
    "C_pedestrian_near_miss": {
        1: [("The car did not stop and hit the man crossing the road", dict(subject="the car", action="did not stop and hit the man"), "P")],
        2: [("The silver car stopped just in time, a metre or so before the man", dict(subject="silver car", action="stopped just in time"), "P")]},
    "D_incomplete_evidence": {
        1: [("the blue car went straight on", dict(subject="blue car", action="went straight on", direction="straight", time_description="Around six in the evening", time_exactness="approximate"), "A"),
            ("Then there was a bang", dict(subject=None, action="bang"), None)],
        2: [("The white car stopped first", dict(subject="white car", action="stopped"), "B"),
            ("the blue car turned into it", dict(subject="blue car", action="turned into it"), "A")]},
}
KIND = {"cctv": "cctv", "dashcam": "dashcam", "imu": "sensor_csv"}


def _ok(r, code=(200, 201, 202)):
    if r.status_code not in code:
        raise RuntimeError(f"{r.request.method} {r.request.url} -> {r.status_code}: {r.text[:300]}")
    return r.json()


def _wait(client, case_id, timeout=600):
    t0 = time.time()
    while time.time() - t0 < timeout:
        jobs = _ok(client.get(f"/api/v1/cases/{case_id}/jobs"))["items"]
        if not any(j["status"] in ("pending", "running", "retrying") for j in jobs):
            bad = [j for j in jobs if j["status"] == "failed"]
            if bad:
                raise RuntimeError(f"job failed: {bad[0]['stage']} {bad[0].get('error')}")
            return jobs
        time.sleep(0.5)
    raise TimeoutError("jobs did not finish")


def _iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / u if u else 0.0


def load(client, key: str, root: Path, *, detections: str = "oracle", declare_sync: bool = True, confirm_identity: bool = True, calibrate: bool = True,
         claims: bool = True, title: str | None = None) -> dict:
    s = world.ALL[key]()
    pkg = root / s.id
    man = json.loads((pkg / "manifest.json").read_text())
    case = _ok(client.post("/api/v1/cases", json={"title": title or f"{s.title} (synthetic)", "designation": "synthetic"}))
    cid = case["id"]
    actors = {a.key: _ok(client.post(f"/api/v1/cases/{cid}/actors", json={"label": a.label, "kind": "pedestrian" if a.kind == "pedestrian" else "vehicle",
                                                                            "attributes": a.attributes}))["id"] for a in s.actors}
    ev = {}
    for name, fname in man["files"].items():
        r = _ok(client.post(f"/api/v1/cases/{cid}/evidence", files={"file": (fname, (pkg / fname).read_bytes())}, data={"kind": KIND[name], "synthetic": "true"}))
        ev[name] = r["evidence"]["id"]
    _wait(client, cid)
    _ok(client.post(f"/api/v1/cases/{cid}/process", json={"stages": ["preprocess"], "chain_detect": detections == "model"}))
    _wait(client, cid)

    if calibrate:
        _ok(client.post(f"/api/v1/evidence/{ev['cctv']}/calibration", json={"points": man["calibration_points_cctv"], "units": "m", "note": "synthetic mat markers"}))
    if "imu" in ev:
        spec = man["imu_spec"]
        _ok(client.post(f"/api/v1/cases/{cid}/sensors", json={"evidence_id": ev["imu"], "mapping": spec["mapping"], "units": spec["units"], "clock": spec["clock"],
                                                               "actor_id": actors[s.imu_actor]}))
    if declare_sync:
        for e in man["declared_edges"]:
            _ok(client.post(f"/api/v1/cases/{cid}/sync-edges", json={"a_evidence": ev[e["a"]], "b_evidence": ev[e["b"]], "offset_ms": e["offset_ms"], "bound_ms": e["bound_ms"],
                                                                      "basis": e["basis"], "note": "synthetic: start times known from the generator"}))
    if detections == "oracle":
        for name in ("cctv", "dashcam"):
            if name not in ev:
                continue
            frames = _ok(client.get(f"/api/v1/evidence/{ev[name]}/frames?limit=5000"))["items"]
            fn = s.cctv_boxes if name == "cctv" else s.dash_boxes
            body = {"model_id": "synthetic-world", "source": "oracle", "note": "boxes projected from the synthetic world model; not a detector",
                    "frames": [{"frame_no": f["frame_no"], "boxes": [{"class": b["class"], "confidence": b["confidence"], "bbox": b["bbox"]} for b in fn(f["time_ms"])]} for f in frames]}
            _ok(client.post(f"/api/v1/evidence/{ev[name]}/detections/import", json=body))
        _wait(client, cid)
    elif detections == "model":
        _ok(client.post(f"/api/v1/cases/{cid}/process", json={"stages": ["detect"]}))
        _wait(client, cid)
        _ok(client.post(f"/api/v1/cases/{cid}/process", json={"stages": ["track"]}))
        _wait(client, cid)

    links = []
    if confirm_identity and detections == "oracle":
        for name in ("cctv", "dashcam"):
            if name not in ev:
                continue
            fn = s.cctv_boxes if name == "cctv" else s.dash_boxes
            frames = {f["time_ms"]: f for f in _ok(client.get(f"/api/v1/evidence/{ev[name]}/frames?limit=5000"))["items"]}
            for t in _ok(client.get(f"/api/v1/evidence/{ev[name]}/tracks?min_observations=5"))["items"]:
                full = _ok(client.get(f"/api/v1/tracks/{t['id']}"))
                votes: dict = {}
                for p in full["points"]:
                    best = max(fn(p["time_ms"]), key=lambda b: _iou(b["bbox"], p["bbox"]), default=None)
                    if best and _iou(best["bbox"], p["bbox"]) > 0.5:
                        votes[best["actor"]] = votes.get(best["actor"], 0) + 1
                if votes:
                    k, n = max(votes.items(), key=lambda kv: kv[1])
                    if n >= 0.7 * len(full["points"]):
                        links.append(_ok(client.post(f"/api/v1/actors/{actors[k]}/links", json={"ref_type": "track", "ref_id": t["id"], "status": "confirmed",
                                                                                                  "basis": {"method": "synthetic: box overlap with the generator's own vehicle",
                                                                                                            "matched_points": n, "points": len(full["points"])}})))

    claim_ids = []
    stmts = []
    for i, (label, text, _) in enumerate(s.witnesses, 1):
        w = _ok(client.post(f"/api/v1/cases/{cid}/witnesses", json={"label": label}))
        st = _ok(client.post(f"/api/v1/witnesses/{w['id']}/statements", json={"text": text, "synthetic": True}))
        stmts.append(st["id"])
        if not claims:
            continue
        for sub, fields, akey in CLAIMS[s.id].get(i, []):
            a = text.index(sub)
            c = _ok(client.post(f"/api/v1/statements/{st['id']}/claims", json={"char_start": a, "char_end": a + len(sub)} | fields))
            claim_ids.append(c["id"])
            if akey and confirm_identity:
                _ok(client.post(f"/api/v1/actors/{actors[akey]}/links", json={"ref_type": "claim", "ref_id": c["id"], "status": "confirmed",
                                                                               "basis": {"method": "investigator reading: the statement names this vehicle by colour"}}))
    return {"case_id": cid, "evidence": ev, "actors": actors, "links": links, "claims": claim_ids, "statements": stmts, "scenario": s.id}
