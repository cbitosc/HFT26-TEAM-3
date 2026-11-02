"""Phase 14: score the reconstruction pipeline against the synthetic scenarios' exact ground truth.

    python scripts/eval_scenarios.py [--detections oracle|model] [--keys A B C D]

Everything is SYNTHETIC. With --detections oracle the boxes come from the world model, so the numbers measure the reconstruction
logic (time sync, rules, geometry), not any detector. With --detections model the real detector runs on the rendered frames; that
measures how well a COCO detector handles these stylized top-down renders, which says little about real footage.
Cases are created in the development database (they double as demo cases).
"""
import argparse
import json
import math
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402
from scenarios import loader, world  # noqa: E402

# Expected rule outcomes, fixed BEFORE running (each follows from the scenario's scripted witness texts and the engine's documented rules).
EXPECT = {
    "A": {"contradictions": {"CON-ACTION-01"}, "corroborations": {"COR-BRAKE-01", "COR-COLL-01", "COR-MANEUVER-01"}, "gaps": {"untestable_claim"}},
    "B": {"contradictions": set(), "corroborations": {"COR-COLL-01"}, "gaps": {"untestable_claim"}},
    "C": {"contradictions": {"CON-COLL-CLAIM-01"}, "corroborations": set(), "gaps": set()},
    "D": {"contradictions": set(), "corroborations": set(), "gaps": {"video_missing_interval", "sensor_missing_interval", "no_camera_calibration"}},
}


def pct(v, q):
    v = sorted(v)
    return v[min(len(v) - 1, int(math.ceil(q * len(v))) - 1)] if v else None


def stats(v):
    return {"n": len(v), "median": round(statistics.median(v), 3), "p95": round(pct(v, 0.95), 3), "max": round(max(v), 3)} if v else {"n": 0}


def run(keys, detections):
    c = TestClient(app)
    c.headers["X-Actor"] = "eval-script"
    root = get_settings().storage_path / "scenarios"
    out = {}
    for k in keys:
        s = world.ALL[k]()
        cal = k != "D"
        r = loader.load(c, k, root, detections=detections, calibrate=cal, title=f"[eval {detections}] {s.title} (synthetic)")
        cid = r["case_id"]
        scn = c.post(f"/api/v1/cases/{cid}/reconstruction/scenarios", json={"name": "baseline"}).json()
        g = lambda w, **q: c.get(f"/api/v1/cases/{cid}/{w}", params=q).json()["items"]  # noqa: E731
        got = {"contradictions": {x["rule_id"] for x in g("contradictions")}, "corroborations": {x["rule_id"] for x in g("corroborations")}, "gaps": {x["gap_type"] for x in g("gaps")}}
        ex = EXPECT[k]
        rules = {w: {"expected": sorted(ex[w]), "got": sorted(got[w]), "missing": sorted(ex[w] - got[w]), "unexpected": sorted(got[w] - ex[w]) if w != "gaps" else []} for w in ex}
        truth = json.loads((root / s.id / "ground_truth.json").read_text())
        off = s.cctv_start
        tl = c.get(f"/api/v1/cases/{cid}/timeline").json()
        evs = [e for lane in tl["lanes"].values() for e in lane]
        errs = {"contact_video_ms": [], "contact_sensor_ms": [], "hard_braking_onset_ms": []}
        for ct in truth["contacts"]:
            t_case = (ct["t_world"] - off) * 1000
            vid = [e for e in evs if e["event_type"] == "possible_collision"]
            sen = [e for e in evs if e["event_type"] == "collision_flag"]
            if vid:
                errs["contact_video_ms"].append(min(abs(e["start_ms"] - t_case) for e in vid))
            if sen:
                errs["contact_sensor_ms"].append(min(abs(e["start_ms"] - t_case) for e in sen))
        for t in truth["events"]:
            if t["type"] == "hard_braking" and t["actor"] == s.imu_actor:
                tc = (t["t_world"] - off) * 1000
                sen = [e for e in evs if e["event_type"] == "hard_braking"]
                if sen:
                    errs["hard_braking_onset_ms"].append(min(abs(e["start_ms"] - tc) for e in sen))
        # ground-plane trajectory error against the bottom-centre of each vehicle's true footprint (the anchor the pipeline uses)
        gerr = []
        for tr in g("trajectories", frame="ground_plane"):
            actor = next((a.key for a in s.actors if r["actors"][a.key] == tr["actor_id"]), None)
            if not actor:
                continue
            a = s.actor(actor)
            for p in tr["points"]:
                if p["case_ms"] is None:
                    continue
                t = off + p["case_ms"] / 1000
                cn = a.corners(t)
                gt = ((cn[:, 0].min() + cn[:, 0].max()) / 2, cn[:, 1].max())
                gerr.append(math.hypot(p["x"] - gt[0], p["y"] - gt[1]))
        out[k] = {"case_id": cid, "title": s.title, "rules": rules, "all_expected_present": all(not v["missing"] for v in rules.values()),
                  "no_unexpected_findings": all(not v["unexpected"] for v in rules.values()), "timing_errors": {n: stats(v) for n, v in errs.items()},
                  "ground_plane_error_m": stats(gerr), "build": scn["build"] and {k2: v for k2, v in scn["build"].items() if k2 != "unsynchronized_sources"}}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--detections", choices=["oracle", "model"], default="oracle")
    ap.add_argument("--keys", nargs="*", default=list(world.ALL))
    a = ap.parse_args()
    res = run(a.keys, a.detections)
    d = Path(__file__).resolve().parents[2] / "research" / "phase14"
    d.mkdir(parents=True, exist_ok=True)
    f = d / f"eval_{a.detections}.json"
    f.write_text(json.dumps({"designation": "SYNTHETIC scenarios; not a measure of real-world performance", "detections": a.detections, "scenarios": res}, indent=2))
    for k, v in res.items():
        print(k, v["title"], "| expected present:", v["all_expected_present"], "| unexpected:", not v["no_unexpected_findings"] is True)
        for w, r in v["rules"].items():
            print("   ", w, "missing", r["missing"], "unexpected", r["unexpected"])
        print("    timing", v["timing_errors"], "| ground", v["ground_plane_error_m"])
    print("written", f)


if __name__ == "__main__":
    main()
