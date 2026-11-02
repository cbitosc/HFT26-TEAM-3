"""Phase 8: clock synchronization (pure solver + API)."""
from datetime import datetime, timedelta, timezone

import pytest

from app.services import sync as S

EV = [{"id": "cctv", "kind": "cctv"}, {"id": "dash", "kind": "dashcam"}, {"id": "imu", "kind": "sensor_csv"}, {"id": "lone", "kind": "dashcam"}]


def edge(i, a, b, off, bound=10.0, status="declared", basis="known_offset"):
    return {"id": i, "a_evidence": a, "b_evidence": b, "offset_ms": off, "bound_ms": bound, "basis": basis, "status": status}


def test_offsets_compose_along_paths_and_bounds_add():
    # t_dash = t_cctv + 1300 ; t_imu = t_dash - 900   =>   t_imu = t_cctv + 400
    r = S.solve(EV, [], [edge("e1", "cctv", "dash", 1300, 20), edge("e2", "dash", "imu", -900, 30)])
    (g,) = r["groups"]
    assert g["reference"] == "cctv" and r["unsynchronized"] == ["lone"] and g["consistent"]
    m = {x["evidence_id"]: x for x in g["members"]}
    assert m["cctv"]["offset_to_reference_ms"] == 0
    assert m["dash"]["offset_to_reference_ms"] == -1300 and m["dash"]["bound_ms"] == 20       # t_cctv = t_dash - 1300
    assert m["imu"]["offset_to_reference_ms"] == -400 and m["imu"]["bound_ms"] == 50 and m["imu"]["path"] == ["e1", "e2"]
    lk = S.lookup(r)
    iv = S.to_case_interval(lk, "imu", 2400.0, 2800.0, 25.0)
    assert (iv["start_ms"], iv["end_ms"], iv["uncertainty_ms"]) == (2000.0, 2400.0, 75.0)   # sensor t=2.4 s is cctv t=2.0 s
    assert S.to_case_interval(lk, "lone", 1.0, None, 0) is None                           # no relation => no case time


def test_edge_direction_is_symmetric():
    fwd = S.solve(EV, [], [edge("e1", "cctv", "dash", 1300)])
    rev = S.solve(EV, [], [edge("e1", "dash", "cctv", -1300)])
    assert S.lookup(fwd)["dash"]["offset"] == S.lookup(rev)["dash"]["offset"] == -1300


def test_unusable_relations_synchronize_nothing():
    for status in ("proposed", "rejected"):
        r = S.solve(EV, [], [edge("e1", "cctv", "dash", 1300, status=status)])
        assert r["groups"] == [] and set(r["unsynchronized"]) == {"cctv", "dash", "imu", "lone"}
    meta = [{"evidence_id": "cctv", "utc_zero": datetime(2026, 10, 30, 10, 0, tzinfo=timezone.utc), "bound_ms": 0, "basis": "embedded_metadata_unverified"},
            {"evidence_id": "dash", "utc_zero": datetime(2026, 10, 30, 10, 0, tzinfo=timezone.utc), "bound_ms": 0, "basis": "embedded_metadata_unverified"}]
    assert S.solve(EV, meta, [])["groups"] == []  # identical-looking metadata times prove nothing


def test_declared_utc_zero_points_synchronize_with_summed_bounds():
    z = datetime(2026, 10, 30, 10, 0, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    clocks = [{"evidence_id": "cctv", "utc_zero": z, "bound_ms": 100, "basis": "declared_by_investigator"},
              {"evidence_id": "dash", "utc_zero": z + timedelta(seconds=1.3), "bound_ms": 200, "basis": "declared_by_investigator"}]
    r = S.solve(EV, clocks, [])
    m = {x["evidence_id"]: x for x in r["groups"][0]["members"]}
    # dash's time 0 happened 1.3 s after cctv's time 0, so t_dash = t_cctv - 1300 and t_cctv = t_dash + 1300
    assert m["dash"]["offset_to_reference_ms"] == pytest.approx(1300) and m["dash"]["bound_ms"] == 300


def test_contradicting_cycle_is_reported_not_hidden():
    edges = [edge("e1", "cctv", "dash", 1300, 20), edge("e2", "dash", "imu", -900, 30), edge("e3", "cctv", "imu", 400, 10)]
    ok = S.solve(EV, [], edges)
    assert ok["inconsistencies"] == [] and ok["groups"][0]["consistent"]
    bad = S.solve(EV, [], [edges[0], edges[1], edge("e3", "cctv", "imu", 2000, 10)])
    assert len(bad["inconsistencies"]) == 1 and bad["inconsistencies"][0]["residual_ms"] > bad["inconsistencies"][0]["allowed_ms"]
    assert bad["groups"][0]["consistent"] is False


def test_scenario_overrides_change_offsets_without_touching_stored_edges():
    base = [edge("e1", "cctv", "dash", 1300, 20)]
    alt = S.solve(EV, [], [dict(e) for e in base], edge_offsets={"e1": 2300})
    assert S.lookup(alt)["dash"]["offset"] == -2300 and base[0]["offset_ms"] == 1300
    assert S.solve(EV, [], [dict(e) for e in base], exclude_edges={"e1"})["groups"] == []


def test_anchor_proposals_are_proposed_never_applied():
    v = [{"id": "se_v", "evidence_id": "cctv", "t_start_ms": 7800.0, "t_end_ms": 8200.0, "uncertainty_ms": 100.0}]
    s = [{"id": "se_s1", "evidence_id": "imu", "t_start_ms": 7400.0, "t_end_ms": 7500.0, "uncertainty_ms": 50.0},
         {"id": "se_s2", "evidence_id": "imu", "t_start_ms": 12000.0, "t_end_ms": 12100.0, "uncertainty_ms": 50.0}]
    (p,) = S.propose_anchor_edges(v, s)
    assert p["status"] == "proposed" and p["basis"] == "anchor_proposal" and p["bound_ms"] >= 500
    assert "alternative" in p["note"] and len(p["evidence_refs"]["alternatives"]) == 1
    assert S.solve(EV, [], [dict(p, id="p1")])["groups"] == []  # proposals synchronize nothing


# --------------------------------------------------------------------------------------- API
def make_case(client):
    return client.post("/api/v1/cases", json={"title": "Sync", "designation": "synthetic"}).json()


def up(client, case_id, name, data, kind):
    r = client.post(f"/api/v1/cases/{case_id}/evidence", files={"file": (name, data)}, data={"kind": kind, "synthetic": "true"})
    return r.json()["evidence"]["id"]


CSV = b"t,v\n" + b"".join(f"{i / 10},{10 + i}\n".encode() for i in range(40))


def test_api_flow_declared_edge_sync_point_and_playback_map(client, sample_video):
    case = make_case(client)
    v = up(client, case["id"], "cam.mp4", sample_video.read_bytes(), "cctv")
    s = up(client, case["id"], "imu.csv", CSV, "sensor_csv")
    assert client.get(f"/api/v1/cases/{case['id']}/sync").json()["groups"] == []
    pm = client.get(f"/api/v1/cases/{case['id']}/playback-map?evidence_id={v}&video_time_ms=500").json()
    assert pm["case_time"] is None and "no recorded clock relation" in pm["reason"]

    e = client.post(f"/api/v1/cases/{case['id']}/sync-edges", json={"a_evidence": v, "b_evidence": s, "offset_ms": 400, "bound_ms": 50, "basis": "known_offset"})
    assert e.status_code == 201 and "= time in" in e.json()["meaning"]
    st = client.get(f"/api/v1/cases/{case['id']}/sync").json()
    assert len(st["groups"]) == 1 and st["groups"][0]["reference"] == v and st["unsynchronized"] == []
    assert client.get(f"/api/v1/cases/{case['id']}/playback-map?evidence_id={s}&video_time_ms=2400").json()["case_time"] == {"ms": 2000.0, "uncertainty_ms": 50.0}

    sp = client.post(f"/api/v1/cases/{case['id']}/sync-points", json={"a": {"evidence_id": v, "time_ms": 1000}, "b": {"evidence_id": s, "time_ms": 1450}}).json()
    assert sp["basis"] == "manual_sync_point" and sp["status"] == "verified" and sp["offset_ms"] == 450 and sp["bound_ms"] > 0
    assert len(client.get(f"/api/v1/cases/{case['id']}/sync").json()["inconsistencies"]) == 0  # 450 vs 400 within the stated bounds


def test_api_clock_records_and_validation(client, sample_video):
    case = make_case(client)
    a = up(client, case["id"], "a.mp4", sample_video.read_bytes(), "cctv")
    b = up(client, case["id"], "imu.csv", CSV, "sensor_csv")
    assert client.put(f"/api/v1/evidence/{a}/clock", json={"utc_zero": "2026-10-30T10:00:00"}).json()["error"]["code"] == "TIMEZONE_REQUIRED"
    r1 = client.put(f"/api/v1/evidence/{a}/clock", json={"utc_zero": "2026-10-30T10:00:00+00:00", "bound_ms": 100, "basis": "embedded_metadata_unverified"})
    r2 = client.put(f"/api/v1/evidence/{b}/clock", json={"utc_zero": "2026-10-30T10:00:00+00:00", "bound_ms": 100, "basis": "embedded_metadata_unverified"})
    assert r1.json()["used_for_sync"] is False
    assert client.get(f"/api/v1/cases/{case['id']}/sync").json()["groups"] == []
    client.put(f"/api/v1/evidence/{a}/clock", json={"utc_zero": "2026-10-30T10:00:00+00:00", "bound_ms": 100, "basis": "declared_by_investigator"})
    client.put(f"/api/v1/evidence/{b}/clock", json={"utc_zero": "2026-10-30T10:00:01.300+00:00", "bound_ms": 200, "basis": "declared_by_investigator"})
    g = client.get(f"/api/v1/cases/{case['id']}/sync").json()["groups"][0]
    assert {m["evidence_id"]: m["bound_ms"] for m in g["members"]}[b] == 300

    assert client.post(f"/api/v1/cases/{case['id']}/sync-edges", json={"a_evidence": a, "b_evidence": a, "offset_ms": 1, "bound_ms": 1}).status_code == 422
    assert client.post(f"/api/v1/cases/{case['id']}/sync-edges", json={"a_evidence": a, "b_evidence": "ev_nope", "offset_ms": 1, "bound_ms": 1}).status_code == 404
    assert client.post(f"/api/v1/cases/{case['id']}/sync-edges", json={"a_evidence": a, "b_evidence": b, "offset_ms": 1, "bound_ms": -5}).status_code == 422
    assert client.post(f"/api/v1/cases/{case['id']}/sync-edges", json={"a_evidence": a, "b_evidence": b, "offset_ms": 1, "bound_ms": 1, "basis": "anchor_proposal"}).status_code == 422


def test_api_proposals_need_confirmation(client, sample_video):
    from app.models import SourceEvent

    case = make_case(client)
    a = up(client, case["id"], "a.mp4", sample_video.read_bytes(), "cctv")
    b = up(client, case["id"], "imu.csv", CSV, "sensor_csv")
    with client.factory() as s:  # candidate events as earlier stages would have stored them
        s.add(SourceEvent(case_id=case["id"], evidence_id=a, stage="video_events", category="machine_detection", event_type="possible_collision",
                          t_start_ms=7800, t_end_ms=8200, uncertainty_ms=100, source_ref={"kind": "video_frames"}, rule_id="VID-COLL-01"))
        s.add(SourceEvent(case_id=case["id"], evidence_id=b, stage="sensors", category="direct_observation", event_type="collision_flag",
                          t_start_ms=7400, t_end_ms=7400, uncertainty_ms=50, source_ref={"kind": "sensor_rows"}, rule_id="SEN-COLL-01"))
        s.commit()
    p = client.post(f"/api/v1/cases/{case['id']}/sync/proposals").json()["items"]
    assert len(p) == 1 and p[0]["status"] == "proposed"
    assert client.get(f"/api/v1/cases/{case['id']}/sync").json()["groups"] == []     # not applied
    assert client.post(f"/api/v1/cases/{case['id']}/sync/proposals").json()["items"] == []  # no duplicates
    c = client.post(f"/api/v1/sync-edges/{p[0]['id']}/confirm").json()
    assert c["status"] == "verified" and client.get(f"/api/v1/cases/{case['id']}/sync").json()["groups"]
    assert client.post("/api/v1/sync-edges/sed_nope/confirm").status_code == 404


def test_a_lone_source_is_its_own_reference_clock():
    from app.services import sync
    r = sync.solve([{"id": "v1", "kind": "cctv"}], [], [])
    assert r["unsynchronized"] == [] and r["groups"][0]["members"][0]["offset_to_reference_ms"] == 0
    two = sync.solve([{"id": "v1", "kind": "cctv"}, {"id": "v2", "kind": "dashcam"}], [], [])
    assert two["groups"] == [] and two["unsynchronized"] == ["v1", "v2"]
