"""Named V2 scenarios for the backend.

FIXTURE: synthetic, unless a docstring says otherwise. A pass here is not a result on the selected accident clip.
Real footage is only tests/test_real_video_pipeline.py::test_selected_accident_video_is_detected_tracked_and_reviewed.
Browser seeking and timeline-video sync belong to the frontend worker and are skipped.
"""
import json
import subprocess
from datetime import datetime, timedelta, timezone

import pytest

from app.config import get_settings
from app.llm.featherless import NotConfigured
from app.models import Event, EventSource
from app.services import incident, sensors, sync
from app.services.engine_rules import correlate, find_gaps
from app.services.reconstruction_view import (
    associations_from_links, clocks_for, completeness, evidence_class, hypotheses, overlaps, trace_for,
)
from app.services.tracking import Det, Frame, associate, build_tracks, default_params, make_tracker, propose_cross_camera_matches
from tests.test_incident_analysis import FakeClient, gen, row, track

PERIOD = 200


def placed(**kw):
    base = {
        "id": "evt_1", "category": "machine_detection", "source_type": "video_cctv", "source_id": "ev_a",
        "event_type": "possible_collision", "title": "Possible collision between tracked vehicles",
        "start_ms": 1000, "end_ms": 1200, "observations": {"source_time_ms": [1000, 1200]},
        "provenance": {"source_event_id": "se_1", "sync_group": "sg"}, "inference": None,
    }
    base.update(kw)
    return base


def assert_source_trace(events):
    """Every reconstructed event cites a source. An inference is complete only through its premises."""
    by_id = {event["id"]: event for event in events}
    assert events
    for event in events:
        traced = trace_for(event, by_id)
        assert traced["complete"] is True, event["id"]
        assert traced["evidence_ids"], event["id"]
        if event.get("category") != "inference":
            assert traced["source_id"] == event["source_id"]
            assert event["source_id"] in traced["evidence_ids"]
        else:
            assert traced["source_id"] is None or traced["source_id"] == event.get("source_id")


def canon(**kw):
    base = {
        "id": "evt", "category": "machine_detection", "event_type": "vehicle_slowing", "actor_id": "act_1",
        "group": "g", "t_start": 1000, "t_end": 1500, "unc": 100, "evidence_id": "ev_a",
        "source_type": "video_cctv", "camera_kind": "cctv", "title": "A tracked vehicle appears to slow",
        "witness_label": "Witness A", "observations": {}, "source_ref": {"frames": [4]}, "tracks": [], "synthetic": True,
    }
    base.update(kw)
    return base


def rule_ctx():
    return {"actors": {"act_1": {"label": "the tracked car"}}, "evidence_labels": {}, "speeds": {}, "sensor_cover": {}}


def edge(eid, a, b, offset, bound=50):
    return {"id": eid, "a_evidence": a, "b_evidence": b, "offset_ms": offset, "bound_ms": bound,
            "basis": "known_offset", "status": "declared"}


def two_cameras(offset):
    evidence = [{"id": "ev_a", "kind": "cctv"}, {"id": "ev_b", "kind": "cctv"}]
    return sync.solve(evidence, [], [edge("e1", "ev_a", "ev_b", offset)])


def ctx_for(solved):
    group = solved["groups"][0]
    return {"pts": {"ev_a": 0.0, "ev_b": 0.0}, "clocks": {},
            "groups": {group["id"]: {"members": len(group["members"]), "consistent": group["consistent"]}}}


def recon_from_row(item):
    return placed(
        id=item["id"], source_id=item["evidence_id"], event_type=item["event_type"], title=item["title"],
        category=item["category"], source_type=item["source_type"], start_ms=item["start_ms"], end_ms=item["end_ms"],
        observations={"source_time_ms": [item["start_ms"], item["end_ms"]]},
        provenance={"source_event_id": item["source_event_id"]},
    )


def collision_rows():
    first = track(1, "car", lambda k: (50 + 30 * k, 200), 40)
    second = track(2, "car", lambda k: (350, 30 * k - 100), 40)
    for tr in (first, second):
        tr["points"] = tr["points"][:11] + [dict(tr["points"][10], frame_no=11 + i, time_ms=(11 + i) * PERIOD) for i in range(20)]
    return incident.rows_from_generated(gen([first, second]))


# --- 24 named scenarios ---------------------------------------------------------------------------

def test_scenario_complete_video_with_incident():
    """FIXTURE: synthetic tracks. Not the selected accident file."""
    rows = collision_rows()
    events = [recon_from_row(item) for item in rows if item["start_ms"] is not None]
    kinds = {item["event_type"] for item in rows}
    assert "possible_collision" in kinds
    assert "visually_supported_contact" not in kinds and "collision" not in kinds
    assert_source_trace(events)
    hit = next(event for event in events if event["event_type"] == "possible_collision")
    assert hit["source_id"] == "ev_generated"
    assert evidence_class(hit["category"], hit["source_type"], hit["source_id"]) == "derived_observation"


def test_scenario_video_starts_after_the_incident():
    """FIXTURE: synthetic. The recording window starts after a trusted wall-clock instant."""
    zero = datetime(2026, 10, 30, 5, 0, tzinfo=timezone.utc)
    event = placed()
    clock = {"pts": {}, "clocks": {"ev_a": {"basis": "declared_by_investigator", "utc_zero": zero}}, "groups": {}}
    body = completeness(
        [event], {event["id"]: event}, [{"id": "ev_a", "kind": "cctv", "status": "valid"}], [], 1, [],
        {"ev_a": {"recording_start": zero + timedelta(seconds=5), "recording_end": zero + timedelta(seconds=30)}}, clock,
    )
    assert "recording_starts_after_event" in body["reasons"]
    assert "recording_ends_before_event" not in body["reasons"]
    assert_source_trace([event])


def test_scenario_video_ends_before_the_incident():
    """FIXTURE: synthetic. The recording window ends before a trusted wall-clock instant."""
    zero = datetime(2026, 10, 30, 5, 0, tzinfo=timezone.utc)
    event = placed()
    clock = {"pts": {}, "clocks": {"ev_a": {"basis": "declared_by_investigator", "utc_zero": zero}}, "groups": {}}
    body = completeness(
        [event], {event["id"]: event}, [{"id": "ev_a", "kind": "cctv", "status": "valid"}], [], 1, [],
        {"ev_a": {"recording_start": zero - timedelta(seconds=30), "recording_end": zero}}, clock,
    )
    assert "recording_ends_before_event" in body["reasons"]
    assert_source_trace([event])


def test_scenario_multi_camera_overlapping():
    """FIXTURE: synthetic. Overlap is a time intersection, not contact."""
    solved = two_cameras(0)
    group = solved["groups"][0]["id"]
    left = placed(id="evt_a", source_id="ev_a", provenance={"source_event_id": "se_a", "sync_group": group})
    right = placed(id="evt_b", source_id="ev_b", start_ms=1100, end_ms=1300, provenance={"source_event_id": "se_b", "sync_group": group})
    found = overlaps([left, right])
    assert found and found[0]["evidence_ids"] == ["ev_a", "ev_b"]
    assert "collision" not in json.dumps(found)
    assert_source_trace([left, right])


def test_scenario_multi_camera_non_overlapping():
    """FIXTURE: synthetic. Disjoint case spans produce no overlap record."""
    left = placed(id="evt_a", source_id="ev_a", start_ms=0, end_ms=500)
    right = placed(id="evt_b", source_id="ev_b", start_ms=5000, end_ms=6000, provenance={"source_event_id": "se_b"})
    assert overlaps([left, right]) == []
    assert_source_trace([left, right])


def test_scenario_conflicting_witnesses():
    """FIXTURE: synthetic. Both statements are kept. The camera match and the camera conflict are separate records."""
    video = canon(
        id="evt_v", event_type="vehicle_maneuver_observed", evidence_id="ev_v",
        observations={"maneuver": "left", "net_heading_change_deg": 50, "track_ids": [3]},
    )
    agree = canon(
        id="evt_w1", category="witness_claim", event_type="vehicle_turned", source_type="witness", camera_kind=None,
        evidence_id="ev_w1", witness_label="Witness A",
        observations={"code_derived_maneuver": "left", "quote": "The car turned left.", "subject": "the car"},
    )
    disagree = canon(
        id="evt_w2", category="witness_claim", event_type="vehicle_turned", source_type="witness", camera_kind=None,
        evidence_id="ev_w2", witness_label="Witness B",
        observations={"code_derived_maneuver": "right", "quote": "The car turned right.", "subject": "the car"},
    )
    out = correlate([video, agree, disagree], rule_ctx())
    assert any(item["rule_id"] == "COR-MANEUVER-01" and set(item["events"]) == {"evt_w1", "evt_v"} for item in out["corroborations"])
    assert any(item["rule_id"] == "CON-ACTION-01" and {item["event_a"], item["event_b"]} == {"evt_w2", "evt_v"} for item in out["contradictions"])
    assert "probability" not in json.dumps(out["corroborations"] + out["contradictions"])
    gaps = find_gaps({"videos": {}, "events": [], "unsynchronized": [], "inconsistencies": [], "tracks": [], "claims": [], "labels": {}})
    assert all(item["rule_id"] != "CON-ACTION-01" for item in gaps)


def test_scenario_witness_corroborated_by_video():
    """FIXTURE: synthetic. Corroboration cites two evidence ids."""
    video = canon(
        id="evt_v", event_type="vehicle_maneuver_observed", evidence_id="ev_v",
        observations={"maneuver": "left", "net_heading_change_deg": 40, "track_ids": [2]},
    )
    claim = canon(
        id="evt_w", category="witness_claim", event_type="vehicle_turned", source_type="witness", camera_kind=None,
        evidence_id="ev_w", observations={"code_derived_maneuver": "left", "quote": "It turned left.", "subject": "the car"},
    )
    out = correlate([video, claim], rule_ctx())
    hit = next(item for item in out["corroborations"] if item["rule_id"] == "COR-MANEUVER-01")
    assert hit["independent"] is True
    assert {video["evidence_id"], claim["evidence_id"]} == {"ev_v", "ev_w"}
    same_file = correlate([video, dict(claim, evidence_id="ev_v")], rule_ctx())
    assert same_file["corroborations"] == []


def test_scenario_witness_claim_not_visible():
    """FIXTURE: synthetic. An unchecked claim is a question, not a contradiction and not a deleted statement."""
    claim = canon(
        id="evt_w", category="witness_claim", event_type="vehicle_turned", source_type="witness", camera_kind=None,
        evidence_id="ev_w", observations={"code_derived_maneuver": "left", "quote": "The car turned left.", "subject": "the car"},
    )
    out = correlate([claim], rule_ctx())
    assert out["corroborations"] == [] and out["contradictions"] == []
    assert any("could not be checked" in item["text"] for item in out["questions"])
    assert claim["evidence_id"] == "ev_w"


def test_scenario_missing_sensor_intervals():
    """FIXTURE: synthetic. A gap is stored. Samples are not invented to fill it."""
    lines = ["t,speed"]
    for i in range(30):
        t = i / 10
        if 1.0 <= t < 2.0:
            continue
        lines.append(f"{t},10")
    parsed = sensors.analyze("\n".join(lines).encode(), {"t": "t", "speed": "speed"}, {"t": "s", "speed": "m/s"})
    gap = next(event for event in parsed["events"] if event["event_type"] == "sensor_gap")
    assert gap["observations"]["no_samples_between"] is True
    facts_event = {
        "id": "evt_gap", "evidence_id": "ev_s", "event_type": "sensor_gap", "t_start": gap["t_start_ms"], "t_end": gap["t_end_ms"],
        "observations": gap["observations"],
    }
    gaps = find_gaps({"videos": {}, "events": [facts_event], "unsynchronized": [], "inconsistencies": [], "tracks": [], "claims": [], "labels": {}})
    assert any(item["gap_type"] == "sensor_missing_interval" for item in gaps)
    for index, gap in enumerate(gaps):
        gap["id"] = f"gap_{index}"
    body = completeness(
        [placed(id="evt_s", source_id="ev_s", source_type="sensor", category="direct_observation", event_type="sensor_gap")],
        {}, [{"id": "ev_s", "kind": "sensor_csv", "status": "valid"}], gaps, 0, [], {}, {"pts": {}, "clocks": {}, "groups": {}},
    )
    assert "missing_intervals" in body["reasons"]
    assert body["missing_evidence"][0]["gap_type"] == "sensor_missing_interval"


def test_scenario_inaccurate_sensor_timestamps():
    """FIXTURE: synthetic. Disagreeing offsets stay an inconsistency. Times are not averaged into a sync."""
    evidence = [{"id": "ev_a", "kind": "cctv"}, {"id": "ev_b", "kind": "cctv"}, {"id": "ev_s", "kind": "sensor_csv"}]
    bad = sync.solve(evidence, [], [edge("e1", "ev_a", "ev_b", 1000), edge("e2", "ev_b", "ev_s", 1000), edge("e3", "ev_a", "ev_s", 5000, 10)])
    assert bad["groups"][0]["consistent"] is False and bad["inconsistencies"]
    group = bad["groups"][0]
    clock = {"pts": {}, "clocks": {}, "groups": {group["id"]: {"members": 3, "consistent": False}}}
    event = placed(source_id="ev_s", source_type="sensor", category="direct_observation", provenance={"sync_group": group["id"], "source_event_id": "se_s"})
    assert clocks_for(event, clock)["case_ms"] == [1000, 1200]
    assert clocks_for(event, clock)["synchronized_ms"] is None
    gaps = find_gaps({"videos": {}, "events": [], "unsynchronized": [], "inconsistencies": bad["inconsistencies"], "tracks": [], "claims": [], "labels": {}})
    assert any(item["gap_type"] == "clock_inconsistency" for item in gaps)
    for index, gap in enumerate(gaps):
        gap["id"] = f"gap_{index}"
    body = completeness([event], {event["id"]: event}, [{"id": "ev_s", "kind": "sensor_csv", "status": "valid"}], gaps, 0, [], {}, clock, contradiction_count=1)
    assert "clock_inconsistency" in body["reasons"]
    assert body["contradiction_count"] == 1
    assert all(item["gap_type"] != "contradiction" for item in body["missing_evidence"])
    assert_source_trace([event])


def test_scenario_camera_clock_offsets():
    """FIXTURE: synthetic. A declared offset moves one camera on the case clock."""
    solved = two_cameras(2500)
    members = {item["evidence_id"]: item["offset_to_reference_ms"] for item in solved["groups"][0]["members"]}
    assert members["ev_a"] == 0
    assert members["ev_b"] == pytest.approx(-2500)
    assert solved["groups"][0]["consistent"] is True


def test_scenario_sensor_video_alignment():
    """FIXTURE: synthetic. Alignment is the declared edge. GPS speed that disagrees with position is flagged, not rewritten."""
    evidence = [{"id": "ev_a", "kind": "cctv"}, {"id": "ev_s", "kind": "sensor_csv"}]
    solved = sync.solve(evidence, [], [edge("e1", "ev_a", "ev_s", 400)])
    looked = sync.lookup(solved)
    assert looked["ev_s"]["offset"] == pytest.approx(-400)
    group = solved["groups"][0]
    clock = {"pts": {}, "clocks": {}, "groups": {group["id"]: {"members": 2, "consistent": True}}}
    video = placed(provenance={"source_event_id": "se_v", "sync_group": group["id"]})
    sensor = placed(
        id="evt_s", source_id="ev_s", source_type="sensor", category="direct_observation", event_type="hard_braking",
        provenance={"source_event_id": "se_s", "sync_group": group["id"]},
    )
    assert clocks_for(video, clock)["synchronized_ms"] == [1000, 1200]
    assert clocks_for(sensor, clock)["synchronized_ms"] == [1000, 1200]
    assert evidence_class("direct_observation", "sensor", "ev_s") == "sensor_observed"
    lat0, dlat = 17.4, 10 / 111_195
    lines = ["t,lat,lon,v"]
    for i in range(8):
        lines.append(f"{i},{lat0 + dlat * i},78.4,25")
    parsed = sensors.analyze("\n".join(lines).encode(), {"t": "t", "lat": "lat", "lon": "lon", "speed": "v"}, {"t": "s", "speed": "m/s"})
    assert parsed["gps_consistency"]["consistent"] is False
    assert parsed["records"][0]["raw"]["speed"] == "25"
    assert parsed["records"][0]["t_raw"] == "0"
    assert parsed["records"][0]["si"]["speed"] == 25
    assert_source_trace([video, sensor])


def test_scenario_no_detected_vehicles():
    """FIXTURE: synthetic. A valid camera with no tracks is not a reconstruction of a vehicle."""
    body = completeness([], {}, [{"id": "ev_a", "kind": "cctv", "status": "valid"}], [], 0, [], {}, {"pts": {}, "clocks": {}, "groups": {}})
    assert body["defensible"] is False
    assert "no_tracked_vehicles" in body["reasons"]
    assert "no_placed_evidence" in body["reasons"]


def test_scenario_tracking_interruptions():
    """FIXTURE: synthetic detections. A short gap stays one track and does not invent the missing boxes."""
    step = 200
    frames = []
    for k in range(20):
        fr = Frame(k, k * step)
        if k not in (8, 9, 10):
            x = 20 + 6 * k
            fr.dets.append(Det(k + 1, k, k * step, "car", 0.9, (x, 100, x + 60, 140)))
        frames.append(fr)
    params = default_params("cctv", 5)
    tracks, _cands = build_tracks(frames, associate(frames, make_tracker(params), None), params, (640, 480))
    assert len(tracks) == 1
    assert tracks[0]["continuity"]["reliability"] == "fragmented"
    assert tracks[0]["continuity"]["gaps"]
    assert not any(pt["frame_no"] in (8, 9, 10) for pt in tracks[0]["points"])
    gaps = find_gaps({
        "videos": {}, "events": [], "unsynchronized": [], "inconsistencies": [], "claims": [], "labels": {},
        "tracks": [{"evidence_id": "ev_a", "track_id": tracks[0]["track_id"], "class": "car", "reliability": "fragmented",
                    "continuations": [], "in_events": False, "actor_id": None, "observations": 17, "candidates": []}],
    })
    assert any(item["gap_type"] == "tracking_fragmentation" for item in gaps)


def test_scenario_possible_collision_without_visible_contact():
    """FIXTURE: synthetic. Image overlap plus a speed drop is a possible collision, not visible contact."""
    rows = collision_rows()
    view = incident.build_view(rows)
    assert view["contact_status"] == "possible_collision"
    assert not any(item["event_type"] == "visually_supported_contact" for item in view["items"])
    hit = next(item for item in rows if item["event_type"] == "possible_collision")
    assert "not physical contact" in json.dumps(hit["observations"])
    assert_source_trace([recon_from_row(hit)])


def test_scenario_no_defensible_reconstruction():
    """FIXTURE: synthetic. No placed traced event, and an incomplete hypothesis is not narrated."""
    premise = placed(id="evt_p", source_id=None, start_ms=None, end_ms=None, observations={})
    inference = placed(
        id="evt_i", category="inference", source_type="engine", source_id=None, start_ms=None, end_ms=None,
        inference={"statement": "Something may have happened.", "alternatives": ["a different cause"], "premises": ["evt_p"]},
    )
    ready, missing = hypotheses([premise, inference], {premise["id"]: premise, inference["id"]: inference})
    assert ready == [] and missing == ["evt_i"]
    body = completeness([premise, inference], {premise["id"]: premise, inference["id"]: inference}, [], [], 0, [], {}, {"pts": {}, "clocks": {}, "groups": {}})
    assert body["defensible"] is False
    assert "no_placed_evidence" in body["reasons"]
    assert body["unsupported_hypotheses"] == ["evt_i"]
    premise["source_id"] = "ev_a"
    ready, missing = hypotheses([premise, inference], {premise["id"]: premise, inference["id"]: inference})
    assert missing == [] and ready[0]["probability"] is None and ready[0]["evidence_class"] == "hypothesis"
    assert_source_trace([premise, inference])


def test_scenario_featherless_failure(client):
    """FIXTURE: synthetic case. A missing key does not invent narrative sentences."""
    case = client.post("/api/v1/cases", json={"title": "Narrative", "designation": "synthetic"}).json()
    scn = client.post(f"/api/v1/cases/{case['id']}/reconstruction/scenarios", json={"name": "baseline"}).json()
    with client.factory() as db:
        from app.models import Case, ReconstructionScenario
        doc = incident.narrate(db, db.get(Case, case["id"]), db.get(ReconstructionScenario, scn["id"]), FakeClient(exc=NotConfigured("FEATHERLESS_API_KEY is not set")), get_settings())
    assert doc["ai_narrative"] is None and doc["ai_narrative_reason"] == "not_configured"
    assert doc["deterministic"]["headline"]
    assert doc["hypothesis_explanation"]["items"] == []
    assert "substitute" not in json.dumps(doc)


def test_scenario_invalid_llm_output(client):
    """FIXTURE: synthetic. Invalid JSON is not stored as the narrative."""
    case = client.post("/api/v1/cases", json={"title": "Bad model", "designation": "synthetic"}).json()
    scn = client.post(f"/api/v1/cases/{case['id']}/reconstruction/scenarios", json={"name": "baseline"}).json()
    with client.factory() as db:
        from app.models import Case, ReconstructionScenario
        doc = incident.narrate(
            db, db.get(Case, case["id"]), db.get(ReconstructionScenario, scn["id"]),
            FakeClient(content="this is not json"), get_settings(),
        )
    assert doc["ai_narrative"] is None and doc["ai_narrative_reason"] == "validation_failed"
    assert doc["deterministic"]["headline"]


def test_scenario_invalid_evidence_refs():
    """FIXTURE: synthetic. A sentence citing an unknown evidence id is rejected."""
    item = incident._project(row())
    sentence = {"text": "A possible collision was recorded. Contact is not confirmed.", "classification": "inferred",
                "event_ids": [item["id"]], "evidence_ids": ["ev_missing"]}
    with pytest.raises(incident.NarrativeInvalid):
        incident.validate_sentences([sentence], [item])


def test_scenario_synthetic_upload_to_real_case(client):
    """FIXTURE: synthetic bytes refused by a real case. This does not exercise real footage."""
    case = client.post("/api/v1/cases", json={"title": "Real case", "designation": "real"}).json()
    rejected = client.post(
        f"/api/v1/cases/{case['id']}/evidence",
        files={"file": ("note.txt", b"generated statement\n")},
        data={"kind": "witness_text", "synthetic": "true"},
    )
    assert rejected.status_code == 422
    assert rejected.json()["error"]["code"] == "SYNTHETIC_IN_REAL_CASE"
    assert client.get(f"/api/v1/cases/{case['id']}/evidence").json()["items"] == []


def test_scenario_report_with_many_raw_events(client):
    """FIXTURE: synthetic. The investigator timeline caps one event type. Stored rows stay, each with a source."""
    case = client.post("/api/v1/cases", json={"title": "Many", "designation": "synthetic"}).json()
    scn = client.post(f"/api/v1/cases/{case['id']}/reconstruction/scenarios", json={"name": "baseline"}).json()
    uploaded = client.post(
        f"/api/v1/cases/{case['id']}/evidence",
        files={"file": ("clip.txt", b"synthetic source\n")},
        data={"kind": "witness_text", "synthetic": "true"},
    )
    assert uploaded.status_code == 201, uploaded.text
    evidence_id = uploaded.json()["evidence"]["id"]
    with client.factory() as db:
        rows = []
        for i in range(31):
            rows.append(Event(
                case_id=case["id"], scenario_id=scn["id"], category="machine_detection", event_type="vehicle_slowing",
                title="A tracked vehicle appears to slow", start_case_ms=i * 100, end_case_ms=i * 100 + 40,
                uncertainty_ms=100, uncertainty_basis="sampling", source_type="video_cctv", source_id=evidence_id,
                observations={"source_time_ms": [i * 100, i * 100 + 40], "motion": "slowing", "coordinate_frame": "image_pixels"},
                confidence={"timestamp": "unsynchronized"}, provenance={"source_event_id": f"se_{i}", "rule_id": "VID-SLOW-01"},
                synthetic=True,
            ))
        db.add_all(rows)
        db.flush()
        for event in rows:
            db.add(EventSource(event_id=event.id, evidence_id=evidence_id, kind="metadata"))
        db.commit()
    report = client.post(f"/api/v1/cases/{case['id']}/reports", json={"format": "investigator"})
    assert report.status_code == 201, report.text
    content = report.json()["content"]
    assert content["stored_event_count"] == 31
    assert len(content["sections"][1]["entries"]) == 30
    assert content["sections"][0]["counts"]["key_events_not_listed_inline"] == 1
    finding = next(item for item in content["sections"][2]["items"] if item["event_type"] == "vehicle_slowing")
    assert len(finding["event_ids"]) == 31
    timeline = client.get(f"/api/v1/cases/{case['id']}/timeline").json()
    shown = [event for lane in timeline["lanes"].values() for event in lane]
    assert len(shown) == 31
    for event in shown:
        assert event["trace"]["complete"] is True
        assert event["trace"]["source_id"] == evidence_id
        assert event["trace"]["evidence_ids"] == [evidence_id]
        assert event["evidence_class"] == "derived_observation"


def test_scenario_rotated_video(tmp_path):
    """FIXTURE: synthetic lavfi clip with a 90-degree display matrix. Not the selected accident file."""
    base = tmp_path / "base.mp4"
    src = tmp_path / "rot.mp4"
    dst = tmp_path / "play.mp4"
    encode = subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=320x240:d=0.2:r=10",
         "-vf", "drawbox=x=0:y=0:w=40:h=240:color=red:t=fill", "-pix_fmt", "yuv420p", "-c:v", "libx264", str(base)],
        capture_output=True, text=True,
    )
    assert encode.returncode == 0, encode.stderr
    spun = subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-display_rotation", "90", "-i", str(base), "-c", "copy", str(src)],
        capture_output=True, text=True,
    )
    assert spun.returncode == 0, spun.stderr
    from app.services import video as vid
    baked = vid.make_playback(src, dst, 0.0, 90)
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", str(dst)],
        capture_output=True, text=True,
    )
    stream = json.loads(probe.stdout)["streams"][0]
    assert baked["mode"] == "transcode"
    assert (int(stream["width"]), int(stream["height"])) == (240, 320)
    assert not any("rotation" in (side or {}) for side in stream.get("side_data_list") or [])


def test_scenario_browser_seeking():
    """FIXTURE: not run. Frontend worker owns browser seeking."""
    pytest.skip("Browser seeking is owned by the frontend worker. This backend module does not claim it.")


def test_scenario_timeline_video_sync():
    """FIXTURE: not run. Frontend worker owns timeline and player sync in the browser."""
    pytest.skip("Timeline-video sync in the browser is owned by the frontend worker. API seek is covered separately.")


# --- 15 multi-camera cases ------------------------------------------------------------------------

def test_multi_two_synchronized_cctv():
    """FIXTURE: synthetic. Equal declared offset, one consistent group, synchronized case time."""
    solved = two_cameras(0)
    assert len(solved["groups"]) == 1 and solved["unsynchronized"] == []
    assert solved["groups"][0]["consistent"] is True
    clock = ctx_for(solved)
    group = solved["groups"][0]["id"]
    left = placed(provenance={"source_event_id": "se_a", "sync_group": group})
    right = placed(id="evt_b", source_id="ev_b", provenance={"source_event_id": "se_b", "sync_group": group})
    assert clocks_for(left, clock)["synchronized_ms"] == [1000, 1200]
    assert clocks_for(right, clock)["synchronized_ms"] == [1000, 1200]
    assert_source_trace([left, right])


def test_multi_different_clock_offsets():
    """FIXTURE: synthetic. The second camera's offset differs. Tracker ids are not matched."""
    solved = two_cameras(4000)
    members = {item["evidence_id"]: item["offset_to_reference_ms"] for item in solved["groups"][0]["members"]}
    assert members["ev_b"] == pytest.approx(-4000)
    assert propose_cross_camera_matches([
        {"evidence_id": "ev_a", "track_id": 1}, {"evidence_id": "ev_b", "track_id": 1},
    ]) == []


def test_multi_overlapping():
    """FIXTURE: synthetic. Two cameras, intersecting case spans."""
    left = placed(id="evt_a", source_id="ev_a", start_ms=0, end_ms=2000)
    right = placed(id="evt_b", source_id="ev_b", start_ms=1500, end_ms=4000, provenance={"source_event_id": "se_b"})
    found = overlaps([left, right])
    assert found[0]["start_ms"] == 1500 and found[0]["end_ms"] == 2000
    assert_source_trace([left, right])


def test_multi_non_overlapping():
    """FIXTURE: synthetic. Two cameras, no shared case interval."""
    left = placed(id="evt_a", source_id="ev_a", start_ms=0, end_ms=1000)
    right = placed(id="evt_b", source_id="ev_b", start_ms=1001, end_ms=2000, provenance={"source_event_id": "se_b"})
    assert overlaps([left, right]) == []
    assert_source_trace([left, right])


def test_multi_recording_starts_after_incident():
    """FIXTURE: synthetic. One of two cameras starts after the trusted instant of the event."""
    zero = datetime(2026, 10, 30, 12, 0, tzinfo=timezone.utc)
    event = placed(source_id="ev_b")
    clock = {"pts": {}, "clocks": {"ev_b": {"basis": "declared_by_investigator", "utc_zero": zero}}, "groups": {}}
    body = completeness(
        [event], {event["id"]: event},
        [{"id": "ev_a", "kind": "cctv", "status": "valid"}, {"id": "ev_b", "kind": "cctv", "status": "valid"}],
        [], 2, [],
        {"ev_b": {"recording_start": zero + timedelta(seconds=10), "recording_end": None}},
        clock,
    )
    assert "recording_starts_after_event" in body["reasons"]
    assert_source_trace([event])


def test_multi_missing_intervals():
    """FIXTURE: synthetic. A missing interval on one camera is a gap. The other camera's event stays traced."""
    other = placed(id="evt_b", source_id="ev_b", provenance={"source_event_id": "se_b"})
    gaps = [{
        "id": "gap_1", "gap_type": "video_missing_interval",
        "scope": {"evidence_id": "ev_a", "from_ms": 100, "to_ms": 900},
    }]
    body = completeness(
        [other], {other["id"]: other},
        [{"id": "ev_a", "kind": "cctv", "status": "valid"}, {"id": "ev_b", "kind": "cctv", "status": "valid"}],
        gaps, 1, [], {}, {"pts": {}, "clocks": {}, "groups": {}},
    )
    assert "missing_intervals" in body["reasons"]
    assert body["missing_evidence"] == [{"gap_id": "gap_1", "gap_type": "video_missing_interval", "evidence_id": "ev_a"}]
    assert body["contradiction_count"] == 0
    assert_source_trace([other])


def test_multi_same_vehicle_two_cameras():
    """FIXTURE: synthetic. A confirmed investigator link can name one actor. The association stays uncertain."""
    tracks = [
        {"pk": "trk_a", "evidence_id": "ev_a", "track_id": 4},
        {"pk": "trk_b", "evidence_id": "ev_b", "track_id": 9},
    ]
    links = [
        {"id": "lnk_a", "actor_id": "act_1", "ref_id": "trk_a"},
        {"id": "lnk_b", "actor_id": "act_1", "ref_id": "trk_b"},
    ]
    found = associations_from_links(tracks, links, [], {})
    assert len(found) == 1
    assert found[0]["status"] == "uncertain" and found[0]["probability"] is None
    assert {item["evidence_id"] for item in found[0]["tracks"]} == {"ev_a", "ev_b"}
    assert {item["kind"] for item in found[0]["supporting"]} == {"actor_link"}


def test_multi_different_similar_vehicles():
    """FIXTURE: synthetic. The same tracker integer in two cameras is not one vehicle."""
    tracks = [
        {"pk": "trk_a", "evidence_id": "ev_a", "track_id": 1},
        {"pk": "trk_b", "evidence_id": "ev_b", "track_id": 1},
    ]
    assert associations_from_links(tracks, [], [], {}) == []
    assert propose_cross_camera_matches(tracks) == []


def test_multi_conflicting_camera_observations():
    """FIXTURE: synthetic. Two cameras can disagree in time overlap without being merged or declared the same vehicle."""
    left = placed(id="evt_a", source_id="ev_a", event_type="vehicle_maneuver_observed", start_ms=1000, end_ms=2000,
                  observations={"source_time_ms": [1000, 2000], "maneuver": "left"})
    right = placed(id="evt_b", source_id="ev_b", event_type="vehicle_maneuver_observed", start_ms=1000, end_ms=2000,
                   observations={"source_time_ms": [1000, 2000], "maneuver": "right"}, provenance={"source_event_id": "se_b"})
    assert overlaps([left, right])
    assert associations_from_links(
        [{"pk": "trk_a", "evidence_id": "ev_a", "track_id": 1}, {"pk": "trk_b", "evidence_id": "ev_b", "track_id": 1}],
        [], [], {},
    ) == []
    out = correlate([
        canon(id="evt_a", evidence_id="ev_a", event_type="vehicle_maneuver_observed", actor_id=None,
              observations={"maneuver": "left", "net_heading_change_deg": 40, "track_ids": [1]}),
        canon(id="evt_b", evidence_id="ev_b", event_type="vehicle_maneuver_observed", actor_id=None,
              observations={"maneuver": "right", "net_heading_change_deg": -40, "track_ids": [1]}),
    ], rule_ctx())
    assert out["contradictions"] == [] and out["corroborations"] == []
    assert_source_trace([left, right])


def test_multi_camera_without_usable_timestamps():
    """FIXTURE: synthetic. No case time, no wall clock from embedded metadata, source id still present."""
    event = placed(start_ms=None, end_ms=None, observations={})
    clock = {"pts": {}, "clocks": {"ev_a": {"basis": "embedded_metadata_unverified", "utc_zero": datetime(2026, 10, 30, tzinfo=timezone.utc)}}, "groups": {}}
    stamped = clocks_for(event, clock)
    assert stamped["case_ms"] is None and stamped["wall_clock"] is None and stamped["synchronized_ms"] is None and stamped["media_ms"] is None
    traced = trace_for(event, {event["id"]: event})
    assert traced["complete"] is True and traced["source_id"] == "ev_a"
    solved = sync.solve([{"id": "ev_a", "kind": "cctv"}, {"id": "ev_b", "kind": "cctv"}], [], [])
    assert solved["groups"] == [] and set(solved["unsynchronized"]) == {"ev_a", "ev_b"}


def test_multi_duplicate_uploads(client):
    """FIXTURE: synthetic. The same bytes are one evidence id and cannot corroborate themselves."""
    case = client.post("/api/v1/cases", json={"title": "Dup", "designation": "synthetic"}).json()
    body = b"camera-bytes-v1\n"
    first = client.post(f"/api/v1/cases/{case['id']}/evidence", files={"file": ("a.txt", body)}, data={"kind": "witness_text", "synthetic": "true"})
    second = client.post(f"/api/v1/cases/{case['id']}/evidence", files={"file": ("b.txt", body)}, data={"kind": "witness_text", "synthetic": "true"})
    assert first.status_code == 201 and second.status_code == 200
    assert second.json()["duplicate"] is True
    assert second.json()["evidence"]["id"] == first.json()["evidence"]["id"]
    lone = first.json()["evidence"]["id"]
    out = correlate([
        canon(id="evt_1", evidence_id=lone, event_type="possible_collision"),
        canon(id="evt_2", evidence_id=lone, event_type="collision_flag", source_type="sensor", camera_kind=None),
    ], rule_ctx())
    assert out["corroborations"] == []


def test_multi_processing_failure(client):
    """FIXTURE: synthetic. An unreadable video is kept, marked invalid, and produces no tracks."""
    case = client.post("/api/v1/cases", json={"title": "Broken", "designation": "synthetic"}).json()
    junk = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 200
    uploaded = client.post(
        f"/api/v1/cases/{case['id']}/evidence",
        files={"file": ("broken.mp4", junk)},
        data={"kind": "cctv", "synthetic": "true"},
    )
    assert uploaded.status_code == 201, uploaded.text
    evidence = client.get(f"/api/v1/evidence/{uploaded.json()['evidence']['id']}").json()
    assert evidence["status"] == "invalid" and evidence["validation"]["errors"]
    assert client.get(evidence["links"]["original"]).content == junk
    client.post(f"/api/v1/cases/{case['id']}/reconstruction/scenarios", json={"name": "baseline"})
    body = client.get(f"/api/v1/cases/{case['id']}/reconstruction/completeness").json()
    assert body["defensible"] is False
    tracks = client.get(f"/api/v1/evidence/{evidence['id']}/tracks")
    assert tracks.status_code == 409 and tracks.json()["error"]["code"] == "TRACKS_NOT_READY"
    stages = {job["stage"] for job in client.get(f"/api/v1/cases/{case['id']}/jobs").json()["items"]}
    assert "track" not in stages and "detect" not in stages


def test_multi_cross_camera_navigation(client, sample_video, offset_video):
    """FIXTURE: synthetic generated clips. API seek returns both cameras. This is not a browser test."""
    case = client.post("/api/v1/cases", json={"title": "Two cams", "designation": "synthetic"}).json()
    first = client.post(
        f"/api/v1/cases/{case['id']}/evidence",
        files={"file": ("a.mp4", sample_video.read_bytes())},
        data={"kind": "cctv", "synthetic": "true"},
    )
    second = client.post(
        f"/api/v1/cases/{case['id']}/evidence",
        files={"file": ("b.mp4", offset_video.read_bytes())},
        data={"kind": "cctv", "synthetic": "true"},
    )
    assert first.status_code == 201 and second.status_code == 201, (first.text, second.text)
    a, b = first.json()["evidence"]["id"], second.json()["evidence"]["id"]
    assert client.put(f"/api/v1/evidence/{a}/clock", json={"utc_zero": "2026-10-30T10:00:00+00:00", "bound_ms": 100, "basis": "declared_by_investigator"}).status_code == 200
    assert client.put(f"/api/v1/evidence/{b}/clock", json={"utc_zero": "2026-10-30T10:00:02+00:00", "bound_ms": 100, "basis": "declared_by_investigator"}).status_code == 200
    built = client.post(f"/api/v1/cases/{case['id']}/reconstruction/scenarios", json={"name": "baseline"})
    assert built.status_code == 201, built.text
    seek = client.get(f"/api/v1/cases/{case['id']}/seek", params={"case_ms": 0}).json()
    assert seek["unsynchronized"] == []
    targets = {item["evidence_id"]: item for item in seek["targets"]}
    assert set(targets) == {a, b}
    assert targets[a]["media_ms"] != targets[b]["media_ms"]
    timeline = client.get(f"/api/v1/cases/{case['id']}/timeline").json()
    for event in [item for lane in timeline["lanes"].values() for item in lane] + timeline["unplaced"]:
        assert event["trace"]["complete"] is True
        assert event["trace"]["source_id"] in (a, b)
        assert event["trace"]["source_id"] in event["trace"]["evidence_ids"]


def test_multi_camera_plus_witness():
    """FIXTURE: synthetic. A witness and one of two cameras can corroborate. The other camera stays its own source."""
    video = canon(
        id="evt_v", event_type="vehicle_maneuver_observed", evidence_id="ev_a",
        observations={"maneuver": "straight", "net_heading_change_deg": 0, "track_ids": [8]},
    )
    other = canon(id="evt_b", evidence_id="ev_b", event_type="vehicle_slowing", actor_id=None, observations={"motion": "slowing"})
    claim = canon(
        id="evt_w", category="witness_claim", event_type="vehicle_went_straight", source_type="witness", camera_kind=None,
        evidence_id="ev_w", observations={"code_derived_maneuver": "straight", "quote": "The car went straight.", "subject": "the car"},
    )
    out = correlate([video, other, claim], rule_ctx())
    hit = next(item for item in out["corroborations"] if item["rule_id"] == "COR-MANEUVER-01")
    assert set(hit["events"]) == {"evt_v", "evt_w"}
    assert "evt_b" not in hit["events"]
    recon = [
        placed(id="evt_v", source_id="ev_a", event_type="vehicle_maneuver_observed"),
        placed(id="evt_b", source_id="ev_b", event_type="vehicle_slowing", provenance={"source_event_id": "se_b"}),
        placed(id="evt_w", source_id="ev_w", category="witness_claim", source_type="witness", event_type="vehicle_went_straight",
               provenance={"source_event_id": "se_w"}),
    ]
    assert_source_trace(recon)
    assert evidence_class("witness_claim", "witness", "ev_w") == "witness_reported"


def test_multi_camera_plus_sensor():
    """FIXTURE: synthetic. A sensor flag and a camera candidate can corroborate. A second camera is not required to agree."""
    video = canon(id="evt_v", event_type="possible_collision", evidence_id="ev_a", title="Possible collision between tracked vehicles")
    other = canon(id="evt_b", event_type="vehicle_slowing", evidence_id="ev_b", actor_id=None)
    sensor = canon(
        id="evt_s", event_type="collision_flag", source_type="sensor", camera_kind=None, evidence_id="ev_s", actor_id=None,
        title="Collision flag recorded by sensor",
    )
    out = correlate([video, other, sensor], rule_ctx())
    hit = next(item for item in out["corroborations"] if item["rule_id"] == "COR-COLL-01")
    assert "evt_v" in hit["events"] and "evt_s" in hit["events"]
    recon = [
        placed(id="evt_v", source_id="ev_a"),
        placed(id="evt_b", source_id="ev_b", event_type="vehicle_slowing", provenance={"source_event_id": "se_b"}),
        placed(id="evt_s", source_id="ev_s", source_type="sensor", category="direct_observation", event_type="collision_flag",
               provenance={"source_event_id": "se_s"}),
    ]
    assert_source_trace(recon)
    assert evidence_class("direct_observation", "sensor", "ev_s") == "sensor_observed"
