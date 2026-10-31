"""Phase 7: sensor mapping, validation, rules (pure), and the API."""
import math

import pytest

from app.services import sensors as S


def csv_bytes(rows, header):
    return ("\n".join([",".join(header)] + [",".join(str(c) for c in r) for r in rows]) + "\n").encode()


def series(n=60, dt=0.1, f=lambda t: {}):
    return [{"t": round(i * dt, 3)} | f(i * dt) for i in range(n)]


def to_csv(rows, cols):
    return csv_bytes([[r.get(c, "") for c in cols] for r in rows], cols)


MAP = {"t": "t", "speed": "speed_kmh", "accel_long": "ax", "heading": "hdg", "collision": "coll"}
UNITS = {"t": "s", "speed": "km/h", "accel_long": "g", "heading": "deg"}
COLS = ["t", "speed_kmh", "ax", "hdg", "coll"]


def scenario_rows():
    def f(t):
        decel = 0.5 <= t < 1.5  # 0.5 g braking for 1 s
        return {"speed_kmh": 72 - (36 * (t - 0.5) if 0.5 <= t < 1.5 else (36 if t >= 1.5 else 0)), "ax": -0.5 if decel else 0.0, "hdg": 90, "coll": 1 if 2.0 <= t < 2.3 else 0}
    return series(40, 0.1, f)


def test_units_are_converted_and_raw_text_is_kept():
    a = S.analyze(to_csv(scenario_rows(), COLS), MAP, UNITS)
    r0 = a["records"][0]
    assert r0["raw"]["speed"] == "72" and r0["si"]["speed"] == pytest.approx(20.0)  # 72 km/h
    brake = next(e for e in a["events"] if e["event_type"] == "hard_braking")
    assert brake["observations"]["min_accel_mps2"] == pytest.approx(-0.5 * S.G, abs=1e-3) and brake["observations"]["method"] == "sensor_axis"
    assert brake["t_start_ms"] == pytest.approx(500, abs=1) and brake["t_end_ms"] == pytest.approx(1400, abs=1)
    assert brake["source_ref"] == {"kind": "sensor_rows", "rows": [6, 15]}


def test_collision_flag_rising_edge_and_stop_and_no_spurious_events():
    a = S.analyze(to_csv(scenario_rows(), COLS), MAP, UNITS)
    types = [e["event_type"] for e in a["events"]]
    assert types.count("collision_flag") == 1 and "sensor_gap" not in types
    flag = next(e for e in a["events"] if e["event_type"] == "collision_flag")
    assert flag["t_start_ms"] == pytest.approx(2000, abs=1) and flag["observations"] == {"source_provided": True}
    assert "stop" not in types  # speed never reaches ~0


def test_braking_from_speed_only_uses_the_slope_and_says_so():
    rows = series(50, 0.1, lambda t: {"speed": 20 if t < 1 else max(0.0, 20 - 8 * (t - 1))})
    a = S.analyze(to_csv(rows, ["t", "speed"]), {"t": "t", "speed": "speed"}, {"t": "s", "speed": "m/s"})
    brake = next(e for e in a["events"] if e["event_type"] == "hard_braking")
    assert brake["observations"]["method"] == "speed_slope" and brake["observations"]["min_accel_mps2"] == pytest.approx(-8, abs=0.5)
    stop = next(e for e in a["events"] if e["event_type"] == "stop")
    assert stop["rule_id"] == "SEN-STOP-01" and stop["t_start_ms"] > brake["t_start_ms"]


def test_gentle_slowing_is_not_hard_braking():
    rows = series(60, 0.1, lambda t: {"speed": 20 - 1.0 * t})  # -1 m/s2
    a = S.analyze(to_csv(rows, ["t", "speed"]), {"t": "t", "speed": "speed"}, {"t": "s", "speed": "m/s"})
    assert [e for e in a["events"] if e["event_type"] == "hard_braking"] == []


def test_heading_wrap_and_integrated_yaw_rate():
    rows = series(40, 0.1, lambda t: {"h": (350 + 40 * max(0.0, t - 1.0)) % 360 if t < 2 else 30.0})  # 350 -> 30 through 0
    a = S.analyze(to_csv(rows, ["t", "h"]), {"t": "t", "heading": "h"}, {"t": "s", "heading": "deg"})
    ev = [e for e in a["events"] if e["event_type"] == "heading_change"]
    assert len(ev) == 1 and ev[0]["observations"]["change_deg"] == pytest.approx(40, abs=2) and ev[0]["observations"]["method"] == "heading_column"

    yaw = series(40, 0.1, lambda t: {"gz": math.radians(60) if 1.0 <= t < 2.0 else 0.0})  # 60 deg/s for 1 s
    b = S.analyze(to_csv(yaw, ["t", "gz"]), {"t": "t", "gyro_z": "gz"}, {"t": "s", "gyro_z": "rad/s"})
    h = next(e for e in b["events"] if e["event_type"] == "heading_change")
    assert h["observations"]["method"] == "integrated_yaw_rate" and abs(h["observations"]["change_deg"]) >= 30


def test_gaps_are_events_and_not_filled():
    rows = [r for r in series(60, 0.1, lambda t: {"speed": 10}) if not 2.0 <= r["t"] < 3.0]
    a = S.analyze(to_csv(rows, ["t", "speed"]), {"t": "t", "speed": "speed"}, {"t": "s", "speed": "m/s"})
    gap = next(e for e in a["events"] if e["event_type"] == "sensor_gap")
    assert gap["observations"]["duration_ms"] == pytest.approx(1100, abs=5) and gap["observations"]["no_samples_between"] is True
    assert a["sampling"]["rate_hz"] == pytest.approx(10, abs=0.1) and a["valid_rows"] == len(rows)


def test_bad_values_are_flagged_and_excluded_not_repaired():
    raw = csv_bytes([[0, 10], [0.1, "abc"], [0.2, 500], [0.3, 11], [0.25, 11], [0.4, 12], [0.5, 12], [0.6, 12]], ["t", "speed"])
    a = S.analyze(raw, {"t": "t", "speed": "speed"}, {"t": "s", "speed": "m/s"})
    issues = {r["row_no"]: r["issues"] for r in a["records"] if r["issues"]}
    assert issues[2] == ["non_numeric:speed"] and issues[3] == ["out_of_range:speed"] and issues[5] == ["time_not_increasing"]
    assert a["records"][4]["valid"] is False and a["records"][1]["valid"] is True  # a bad cell does not invalidate the row's time
    assert "speed" not in a["records"][1]["si"]  # nothing invented in its place
    assert a["records"][1]["raw"]["speed"] == "abc"


def test_undeclared_or_wrong_mapping_is_refused():
    raw = to_csv(scenario_rows(), COLS)
    with pytest.raises(S.MappingError, match="units.speed must be declared"):
        S.analyze(raw, {"t": "t", "speed": "speed_kmh"}, {"t": "s"})
    with pytest.raises(S.MappingError, match="not found"):
        S.analyze(raw, {"t": "t", "speed": "nope"}, {"t": "s", "speed": "m/s"})
    with pytest.raises(S.MappingError, match="unknown field"):
        S.analyze(raw, {"t": "t", "banana": "t"}, {"t": "s"})
    with pytest.raises(S.MappingError, match="time column"):
        S.analyze(raw, {"speed": "speed_kmh"}, {"speed": "km/h"})


def test_iso_and_epoch_times_are_relative_to_first_sample_and_axis_sign_flips():
    iso = csv_bytes([["2026-10-30T10:32:14.000Z", 5, -2.0], ["2026-10-30T10:32:14.500Z", 5, -2.0], ["2026-10-30T10:32:15.000Z", 5, -2.0]], ["ts", "v", "a"])
    a = S.analyze(iso, {"t": "ts", "speed": "v", "accel_long": "a"}, {"t": "iso", "speed": "m/s", "accel_long": "m/s2"}, clock="utc", sign={"accel_long": -1})
    assert [r["time_ms"] for r in a["records"]] == [0, 500, 1000] and a["records"][0]["si"]["accel_long"] == 2.0
    assert a["meta"]["first_sample_abs_ms"] == pytest.approx(1793356334000, rel=1e-9)
    epoch = csv_bytes([[1000.0, 1], [1000.5, 1], [1001.0, 1]], ["e", "v"])
    b = S.analyze(epoch, {"t": "e", "speed": "v"}, {"t": "epoch_s", "speed": "m/s"})
    assert [r["time_ms"] for r in b["records"]] == [0, 500, 1000]


def test_gps_and_speed_consistency_check():
    lat0, dlat = 17.4, 10 / 111_195  # 10 m per step
    rows = series(20, 1.0, lambda t: {"lat": lat0 + dlat * t, "lon": 78.4, "v": 10.0})
    ok = S.analyze(to_csv(rows, ["t", "lat", "lon", "v"]), {"t": "t", "lat": "lat", "lon": "lon", "speed": "v"}, {"t": "s", "speed": "m/s"})
    assert ok["gps_consistency"]["consistent"] is True
    bad = S.analyze(to_csv([r | {"v": 25.0} for r in rows], ["t", "lat", "lon", "v"]), {"t": "t", "lat": "lat", "lon": "lon", "speed": "v"}, {"t": "s", "speed": "m/s"})
    assert bad["gps_consistency"]["consistent"] is False


# --------------------------------------------------------------------------------------- API
def make_case(client):
    return client.post("/api/v1/cases", json={"title": "Sensors", "designation": "synthetic"}).json()


def upload_csv(client, case_id, data, name="imu.csv"):
    r = client.post(f"/api/v1/cases/{case_id}/evidence", files={"file": (name, data)}, data={"kind": "sensor_csv", "synthetic": "true"})
    assert r.status_code == 201, r.text
    return r.json()["evidence"]["id"]


SPEC = {"mapping": MAP, "units": UNITS, "clock": "relative"}


def test_preview_writes_nothing_and_register_stores_everything(client):
    case = make_case(client)
    eid = upload_csv(client, case["id"], to_csv(scenario_rows(), COLS))
    pv = client.post(f"/api/v1/evidence/{eid}/sensor-preview", json=SPEC).json()
    assert pv["rows"] == 40 and {e["event_type"] for e in pv["events"]} == {"hard_braking", "collision_flag"} and pv["first_rows"][0]["si"]["speed"] == pytest.approx(20)
    assert client.get(f"/api/v1/evidence/{eid}/sensor-records").status_code == 409  # still unregistered

    actor = client.post(f"/api/v1/cases/{case['id']}/actors", json={"label": "Vehicle A", "attributes": {"color": "blue"}}).json()
    r = client.post(f"/api/v1/cases/{case['id']}/sensors", json=SPEC | {"evidence_id": eid, "actor_id": actor["id"]})
    assert r.status_code == 201 and r.json()["synthetic"] is True and "not synchronized" in r.json()["note"]
    recs = client.get(f"/api/v1/evidence/{eid}/sensor-records?fields=speed&include_raw=true").json()
    assert len(recs["items"]) == 40 and recs["items"][0]["si"] == {"speed": pytest.approx(20.0)} and recs["items"][0]["raw"]["speed"] == "72"
    ev = client.get(f"/api/v1/evidence/{eid}/sensor-events").json()["items"]
    assert [e["event_type"] for e in ev] == ["hard_braking", "collision_flag"] and ev[0]["source_ref"]["rows"] == [6, 15]
    assert client.get(f"/api/v1/cases/{case['id']}/sensors").json()["items"][0]["actor_id"] == actor["id"]
    assert client.post(f"/api/v1/cases/{case['id']}/sensors", json=SPEC | {"evidence_id": eid}).status_code == 409


def test_register_validation_errors(client):
    case = make_case(client)
    eid = upload_csv(client, case["id"], to_csv(scenario_rows(), COLS))
    bad = client.post(f"/api/v1/cases/{case['id']}/sensors", json={"evidence_id": eid, "mapping": {"t": "t", "speed": "speed_kmh"}, "units": {"t": "s"}})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "MAPPING_INVALID"
    assert client.post(f"/api/v1/cases/{case['id']}/sensors", json=SPEC | {"evidence_id": eid, "actor_id": "act_nope"}).status_code == 404
    other = make_case(client)
    assert client.post(f"/api/v1/cases/{other['id']}/sensors", json=SPEC | {"evidence_id": eid}).status_code == 404  # evidence of another case
    txt = client.post(f"/api/v1/cases/{case['id']}/evidence", files={"file": ("w.txt", b"hello witness")}, data={"kind": "witness_text", "synthetic": "true"}).json()["evidence"]["id"]
    assert client.post(f"/api/v1/evidence/{txt}/sensor-preview", json=SPEC).json()["error"]["code"] == "NOT_A_SENSOR_FILE"


def test_raw_sensor_rows_are_protected_by_the_database(client):
    from sqlalchemy import text

    case = make_case(client)
    eid = upload_csv(client, case["id"], to_csv(scenario_rows(), COLS))
    client.post(f"/api/v1/cases/{case['id']}/sensors", json=SPEC | {"evidence_id": eid})
    with client.factory() as s:
        with pytest.raises(Exception, match="raw values and timestamps cannot be modified"):
            s.execute(text("update sensor_records set t_raw='tampered' where row_no=1"))
