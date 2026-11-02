"""Create the four synthetic demo cases (oracle boxes, manual claims) with a baseline reconstruction and a report each.
Scenario A also gets an alternative reconstruction that assumes the sensor clock is 1.5 s later, to show scenario comparison.

    python scripts/build_scenarios.py          # once: render the synthetic packages
    python scripts/seed_demo.py [--reset]      # --reset empties the dev database first, only if every case in it is synthetic

Everything created here is SYNTHETIC and labelled as such.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402
from scenarios import loader, world  # noqa: E402


def reset(url):
    eng = create_engine(url)
    with eng.begin() as c:
        bad = c.execute(text("select count(*) from cases where designation <> 'synthetic'")).scalar()
        if bad:
            raise SystemExit(f"refusing to reset: {bad} case(s) are not synthetic")
        tables = c.execute(text("select tablename from pg_tables where schemaname='public' and tablename <> 'alembic_version'")).scalars().all()
        c.execute(text("TRUNCATE " + ", ".join(tables) + " RESTART IDENTITY CASCADE"))
    print("development database emptied (it held only synthetic cases)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true")
    a = ap.parse_args()
    s = get_settings()
    if a.reset:
        reset(s.database_url)
    c = TestClient(app)
    c.headers["X-Actor"] = "demo-seed"
    root = s.storage_path / "scenarios"
    for k in world.ALL:
        sc = world.ALL[k]()
        r = loader.load(c, k, root, calibrate=(k != "D"), title=f"{sc.title} (synthetic demo {k})")
        cid = r["case_id"]
        base = c.post(f"/api/v1/cases/{cid}/reconstruction/scenarios", json={"name": "Baseline: declared clock relations"}).json()
        if k == "A":
            imu = next(e for e in c.get(f"/api/v1/cases/{cid}/sync").json()["edges"] if e["b_evidence"] == r["evidence"]["imu"])
            c.post(f"/api/v1/cases/{cid}/reconstruction/scenarios", json={"name": "Alternative: sensor clock 1.5 s later", "edge_offsets": {imu["id"]: imu["offset_ms"] + 1500}})
        rep = c.post(f"/api/v1/cases/{cid}/reports", json={}).json()
        print(k, cid, "events", base["build"]["events"], "contradictions", base["build"]["contradictions"], "corroborations", base["build"]["corroborations"],
              "gaps", base["build"]["gaps"], "| report v%d %s" % (rep["version"], "valid" if rep["validation"]["passed"] else "INVALID"))


if __name__ == "__main__":
    main()
