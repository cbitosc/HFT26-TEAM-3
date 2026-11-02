"""Reconstruction engine on the synthetic scenarios (oracle boxes, manual claims). Results here describe the engine's logic on a
synthetic world; they say nothing about accuracy on real footage."""
import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models import Contradiction, Corroboration, Event, GapRecord
from scenarios import loader, world

ROOT = get_settings().storage_path / "scenarios"
pytestmark = pytest.mark.skipif(not (ROOT / "A_intersection_collision" / "manifest.json").exists(), reason="run scripts/build_scenarios.py first")


@pytest.fixture()
def big(client):
    client.settings.max_video_mb = 50
    client.settings.max_other_mb = 5
    return client


def build(c, key="A", **kw):
    run = loader.load(c, key, ROOT, **kw)
    r = c.post(f"/api/v1/cases/{run['case_id']}/reconstruction/scenarios", json={"name": "baseline"})
    assert r.status_code == 201, r.text
    return run, r.json()


def items(c, case_id, what, **q):
    return c.get(f"/api/v1/cases/{case_id}/{what}", params=q).json()["items"]


def test_scenario_a_baseline_findings(big):
    run, scn = build(big)
    cid = run["case_id"]
    assert scn["is_baseline"] and scn["build"]["unsynchronized_sources"] == []
    cons = items(big, cid, "contradictions")
    kinds = {c["rule_id"]: c for c in cons}
    # Witness 2 says the blue car turned left; the camera track of the confirmed blue car goes straight
    assert "CON-ACTION-01" in kinds and kinds["CON-ACTION-01"]["strength"] == "clear"
    assert kinds["CON-ACTION-01"]["basis"]["witness_maneuver"] == "left" and kinds["CON-ACTION-01"]["basis"]["video_maneuver"] == "straight"
    assert "does not determine which account is correct" in kinds["CON-ACTION-01"]["explanation"]
    crb = {c["rule_id"] for c in items(big, cid, "corroborations")}
    assert {"COR-BRAKE-01", "COR-COLL-01", "COR-MANEUVER-01"} <= crb  # witness 1 (straight) agrees with the camera
    for c in items(big, cid, "corroborations"):
        assert c["independent"] is True
    # a collision candidate exists near case-ms 4,820 on the CCTV clock (world t=7.82 minus cctv_start 3.0)
    cand = [e for e in items(big, cid, "collision-candidates") if e["event_type"] == "possible_collision"]
    assert cand and abs(cand[0]["start_ms"] - 4820) < 700
    gaps = {g["gap_type"] for g in items(big, cid, "gaps")}
    assert "untestable_claim" in gaps  # "very fast" has no number
    assert "no_camera_calibration" not in gaps  # CCTV was calibrated


def test_every_stored_event_is_traceable_and_inferences_have_alternatives(big, session=None):
    run, scn = build(big)
    cid = run["case_id"]
    tl = big.get(f"/api/v1/cases/{cid}/timeline").json()
    assert set(tl["lanes"]) >= {"cctv", "sensor"}
    with big.factory() as s:
        for e in s.execute(select(Event).where(Event.case_id == cid)).scalars():
            if e.category == "inference":
                assert e.inference["premises"] and e.inference["alternatives"]
            else:
                assert e.provenance["scenario_id"] and e.source_id
    inf = [e for lane in tl["lanes"].values() for e in lane if e["category"] == "inference"]
    assert inf and "may have" in inf[0]["title"] and "not an established fact" in inf[0]["title"]
    summ = big.get(f"/api/v1/events/{inf[0]['id']}/summary").json()
    assert summ["inferences"] and summ["inferences"][0]["alternatives"]


def test_unsynchronized_sources_are_never_ordered(big):
    run, scn = build(big, declare_sync=False)
    cid = run["case_id"]
    tl = big.get(f"/api/v1/cases/{cid}/timeline").json()
    assert tl["lanes"] == {} or all(e["synchronized"] for lane in tl["lanes"].values() for e in lane)
    assert len(tl["unplaced"]) > 0 and all(e["start_ms"] is None for e in tl["unplaced"])
    types = {g["gap_type"] for g in items(big, cid, "gaps")}
    assert "unsynchronized_source" in types
    # witness-vs-camera maneuver agreement needs no clock; nothing that compares times across unrelated clocks may appear
    assert not ({c["rule_id"] for c in items(big, cid, "corroborations")} & {"COR-BRAKE-01", "COR-COLL-01"})
    assert [e for e in items(big, cid, "collision-candidates") if e["synchronized"]] == []


def test_unconfirmed_identity_blocks_comparison(big):
    run, scn = build(big, confirm_identity=False)
    cid = run["case_id"]
    assert [c for c in items(big, cid, "contradictions") if c["rule_id"] == "CON-ACTION-01"] == []
    assert "unconfirmed_vehicle_identity" in {g["gap_type"] for g in items(big, cid, "gaps")}
    qs = [f for f in items(big, cid, "findings", kind="open_question")]
    assert qs and any("not confirmed" in (q["text"] or "") for q in qs)


def test_alternative_scenario_changes_times_without_touching_the_baseline(big):
    run, scn = build(big)
    cid = run["case_id"]
    edges = big.get(f"/api/v1/cases/{cid}/sync").json()["edges"] if "edges" in big.get(f"/api/v1/cases/{cid}/sync").json() else []
    imu_edge = next(e for e in (edges or big.get(f"/api/v1/cases/{cid}/sync-edges").json()["items"]) if e["b_evidence"] == run["evidence"]["imu"])
    alt = big.post(f"/api/v1/cases/{cid}/reconstruction/scenarios", json={"name": "imu clock 1.5 s later", "edge_offsets": {imu_edge["id"]: imu_edge["offset_ms"] + 1500}}).json()
    assert alt["is_baseline"] is False
    d = big.get(f"/api/v1/cases/{cid}/reconstruction/diff", params={"a": scn["id"], "b": alt["id"]}).json()
    assert d["moved_events"] and all(m["a_ms"] != m["b_ms"] for m in d["moved_events"])
    # the baseline is unchanged and still the default
    assert big.get(f"/api/v1/cases/{cid}/reconstruction/scenarios").json()["items"][0]["id"] == scn["id"]
    assert [c["rule_id"] for c in items(big, cid, "corroborations")].count("COR-COLL-01") >= 1
    with big.factory() as s:
        assert s.execute(select(Event).where(Event.scenario_id == alt["id"])).scalars().first() is not None


def test_pedestrian_near_miss_is_flagged_marginal_and_not_called_a_collision(big):
    run, scn = build(big, key="C")
    cid = run["case_id"]
    cons = items(big, cid, "contradictions")
    claim = [c for c in cons if c["rule_id"] == "CON-COLL-CLAIM-01"]
    assert claim and claim[0]["strength"] == "marginal" and "does not establish that no contact occurred" in claim[0]["explanation"]
    assert [e for e in items(big, cid, "collision-candidates") if e["event_type"] == "possible_collision"] == []


def test_rear_end_and_quantity_claim_stay_open_without_a_number(big):
    run, scn = build(big, key="B")
    cid = run["case_id"]
    assert any(c["rule_id"] == "COR-COLL-01" for c in items(big, cid, "corroborations"))
    qs = items(big, cid, "findings", kind="open_question")
    assert any("no number" in q["text"] for q in qs)


def test_degraded_scenario_reports_gaps_not_guesses(big):
    run, scn = build(big, key="D", calibrate=False)
    cid = run["case_id"]
    types = {g["gap_type"] for g in items(big, cid, "gaps")}
    assert {"video_missing_interval", "sensor_missing_interval", "no_camera_calibration"} <= types
    # no ground-plane trajectories without calibration
    assert items(big, cid, "trajectories", frame="ground_plane") == []
    assert items(big, cid, "trajectories", frame="image")
    vm = [g for g in items(big, cid, "gaps") if g["gap_type"] == "video_missing_interval"][0]
    assert vm["scope"]["case_from_ms"] is not None and "cannot be reconstructed" in vm["recommendation"]


def test_calibrated_ground_trajectories_carry_uncertainty(big):
    run, scn = build(big)
    cid = run["case_id"]
    g = items(big, cid, "trajectories", frame="ground_plane")
    assert g and all("uncertainty" in p and "inside_calibrated_region" in p for t in g for p in t["points"])
    assert all(t["track_ref"]["moving_camera"] is False for t in g)
    img = items(big, cid, "trajectories", frame="image")
    assert any(t["track_ref"]["moving_camera"] for t in img) and "moving camera" in " ".join(t["calibration_note"] for t in img if t["track_ref"]["moving_camera"]).lower()


def test_findings_can_be_reviewed_and_seek_maps_case_time(big):
    run, scn = build(big)
    cid = run["case_id"]
    f = items(big, cid, "findings")[0]
    r = big.patch(f"/api/v1/findings/{f['id']}", json={"review_status": "reviewed"}, headers={"X-Actor": "inspector"})
    assert r.json()["review_status"] == "reviewed" and r.json()["reviewer"] == "inspector"
    sk = big.get(f"/api/v1/cases/{cid}/seek", params={"case_ms": 5000}).json()
    t = {x["evidence_id"]: x for x in sk["targets"]}
    assert t[run["evidence"]["cctv"]]["media_ms"] == 5000 and abs(t[run["evidence"]["dashcam"]]["media_ms"] - 4000) < 1


def test_language_never_assigns_fault(big):
    run, scn = build(big)
    cid = run["case_id"]
    import json
    blob = json.dumps([items(big, cid, w) for w in ("contradictions", "corroborations", "gaps", "findings")]).lower()
    for banned in ("at fault", "guilty", "liable", "negligent", "blame", "caused by", "responsible for the"):
        assert banned not in blob


def test_candidate_identity_links_are_not_enough(big):
    run, _ = build(big, confirm_identity=False)
    cid = run["case_id"]
    a = run["actors"]["A"]
    for t in big.get(f"/api/v1/evidence/{run['evidence']['cctv']}/tracks?min_observations=5").json()["items"]:
        big.post(f"/api/v1/actors/{a}/links", json={"ref_type": "track", "ref_id": t["id"], "status": "candidate"})
    for c in run["claims"]:
        big.post(f"/api/v1/actors/{a}/links", json={"ref_type": "claim", "ref_id": c, "status": "candidate"})
    scn = big.post(f"/api/v1/cases/{cid}/reconstruction/scenarios", json={"name": "with candidate links"}).json()
    assert [c for c in items(big, cid, "contradictions", scenario_id=scn["id"]) if c["rule_id"] == "CON-ACTION-01"] == []
    ev = big.get(f"/api/v1/cases/{cid}/timeline", params={"scenario_id": scn["id"]}).json()
    assert all(e["actor_id"] is None for lane in ev["lanes"].values() for e in lane if e["source_type"].startswith("video")) 
