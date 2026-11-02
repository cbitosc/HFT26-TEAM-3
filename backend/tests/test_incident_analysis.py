"""Incident list, narrative checks, and the read models in INCIDENT_ANALYSIS_DESIGN."""
import json

from sqlalchemy import select

from app.config import get_settings
from app.llm.featherless import ChatResult, NotConfigured, PolicyBlocked
from app.models import Case, Event, EventSource, ExtractedFrame, ReconstructionScenario
from app.services import incident, report as rep, video_events as V

PERIOD = 200


class FakeClient:
    def __init__(self, exc=None, content=None):
        self.exc = exc
        self.content = content
        self.calls = []
        self.validation = []

    def chat(self, session, **kwargs):
        self.calls.append(kwargs)
        if self.exc:
            raise self.exc
        return ChatResult(self.content, 1, 1, 1, False, 7)

    def record_validation(self, session, call_id, valid):
        self.validation.append((call_id, valid))


def track(tid, cls, fn, n, start=0, w=60, h=40):
    pts = []
    for k in range(n):
        x, y = fn(k)
        pts.append({"frame_no": start + k, "time_ms": (start + k) * PERIOD, "bbox": [x - w / 2, y - h, x + w / 2, y], "anchor": [x, y], "confidence": 0.9})
    return {"track_id": tid, "class": cls, "points": pts}


def gen(tracks, **kw):
    return V.generate(tracks, kind="cctv", period_ms=PERIOD, video_duration_ms=kw.pop("dur", 8000), **kw)


def row(**kw):
    base = {
        "id": "evt_a", "source_event_id": "se_a", "event_type": "possible_collision", "category": "machine_detection",
        "title": "Possible collision between tracked vehicles", "start_ms": 1000, "end_ms": 1200, "uncertainty_ms": 100,
        "uncertainty_basis": "sampling", "evidence_id": "ev_1", "track_ids": [4, 9], "track_classes": ["car", "car"],
        "frames": [10, 12], "frame_times_ms": [1000, 1200], "rule_id": "VID-COLL-01", "source_type": "video_cctv",
        "observations": {"relation": "box_overlap", "abrupt_speed_changes": [{"track_id": 4, "relative_speed_before": 2.0, "relative_speed_after": 0.2}],
                         "coordinate_frame": "image_pixels", "note": "image-space proximity or box overlap is not physical contact or distance"},
    }
    base.update(kw)
    return base


def _case(client):
    case = client.post("/api/v1/cases", json={"title": "Incident", "designation": "real"}).json()
    scn = client.post(f"/api/v1/cases/{case['id']}/reconstruction/scenarios", json={"name": "baseline"}).json()
    return case, scn


def test_evidence_constrained_output():
    item = incident._project(row())
    invented = {"text": "The plate was ABC123 and the make was unknown.", "classification": "inferred", "event_ids": [item["id"]], "evidence_ids": ["ev_1"]}
    unknown = {"text": "A possible collision was recorded. Contact is not confirmed.", "classification": "inferred", "event_ids": ["evt_missing"], "evidence_ids": ["ev_1"]}
    for sentence in (invented, unknown):
        try:
            incident.validate_sentences([sentence], [item])
        except incident.NarrativeInvalid:
            pass
        else:
            raise AssertionError(sentence["text"])


def test_hypothesis_sentence_must_cite_the_stored_evidence_ids():
    """FIXTURE: synthetic. A hypothesis sentence is kept only when its evidence ids match the stored hypothesis."""
    item = incident._project(row())
    hyp = {"id": "evt_h", "evidence_ids": ["ev_1"], "statement": "Braking may have preceded the candidate.", "alternatives": ["braking for the junction"]}
    empty = {"text": "The stored alternative cites the same evidence.", "classification": "inferred", "event_ids": ["evt_h"], "evidence_ids": []}
    wrong = {"text": "The stored alternative cites the same evidence.", "classification": "inferred", "event_ids": ["evt_h"], "evidence_ids": ["ev_other"]}
    unknown = {"text": "The stored alternative cites the same evidence.", "classification": "inferred", "event_ids": ["evt_missing"], "evidence_ids": ["ev_1"]}
    for sentence in (empty, wrong, unknown):
        try:
            incident.validate_sentences([sentence], [item], [hyp])
        except incident.NarrativeInvalid:
            pass
        else:
            raise AssertionError(sentence)
    ok = {"text": "The stored alternative cites the same evidence.", "classification": "inferred", "event_ids": ["evt_h"], "evidence_ids": ["ev_1"]}
    incident.validate_sentences([ok], [item], [hyp])
    blank = {"id": "evt_blank", "evidence_ids": [], "statement": "No premise evidence.", "alternatives": ["unknown"]}
    bare = {"text": "This alternative has no evidence ids.", "classification": "insufficient", "event_ids": ["evt_blank"], "evidence_ids": ["ev_1"]}
    try:
        incident.validate_sentences([bare], [item], [blank])
    except incident.NarrativeInvalid:
        pass
    else:
        raise AssertionError("hypothesis without evidence ids was accepted")


def test_evidence_ids_are_required():
    item = incident._project(row())
    bare = {"text": "A possible collision was recorded. Contact is not confirmed.", "classification": "inferred", "event_ids": [], "evidence_ids": []}
    try:
        incident.validate_sentences([bare], [item])
    except incident.NarrativeInvalid:
        pass
    else:
        raise AssertionError("uncited sentence was accepted")
    ok = {"text": "A possible collision was recorded from image-space boxes and a speed drop. Contact is not confirmed.",
          "classification": "inferred", "event_ids": [item["id"]], "evidence_ids": ["ev_1"]}
    incident.validate_sentences([ok], [item])
    method = {"text": "This report does not determine fault.", "classification": "insufficient", "event_ids": [], "evidence_ids": []}
    incident.validate_sentences([method, ok], [item])


def test_missing_evidence():
    view = incident.build_view([row(evidence_id=None)])
    blob = json.dumps(view["deterministic"])
    assert "ev_" not in blob
    assert any(s["evidence_ids"] == [] and s["classification"] == "insufficient" for s in view["deterministic"]["sentences"])
    assert view["contact_status"] == "insufficient_evidence"


def test_possible_versus_visually_supported_contact():
    a = track(1, "car", lambda k: (50 + 30 * k, 200), 40)
    b = track(2, "car", lambda k: (350, 30 * k - 100), 40)
    for tr in (a, b):
        tr["points"] = tr["points"][:11] + [dict(tr["points"][10], frame_no=11 + i, time_ms=(11 + i) * PERIOD) for i in range(20)]
    view = incident.build_view(incident.rows_from_generated(gen([a, b])))
    types = {i["event_type"] for i in view["items"]}
    assert "collision" not in types and "visually_supported_contact" not in types
    coll = [i for i in view["items"] if i["event_type"] == "possible_collision"]
    assert len(coll) == 1
    assert coll[0]["display"] == "amber" and coll[0]["classification"] == "inferred" and coll[0]["measurement_classification"] == "observed"
    assert view["contact_status"] == "possible_collision"
    assert all(i["display"] != "critical" for i in view["items"])
    named = {"text": "Visually supported contact is visible.", "classification": "observed", "event_ids": [coll[0]["id"]], "evidence_ids": ["ev_generated"]}
    try:
        incident.validate_sentences([named], view["items"])
    except incident.NarrativeInvalid:
        pass
    else:
        raise AssertionError("visual contact was accepted without that event")


def test_overlap_without_a_speed_drop_stays_neutral():
    a = track(1, "car", lambda k: (50 + 30 * k, 200), 30)
    b = track(2, "car", lambda k: (350, 30 * k - 100) if k < 10 else (350 + 30 * (k - 10), 200), 30)
    events = gen([a, b])
    assert [e for e in events if e["event_type"] == "possible_collision"] == []
    view = incident.build_view(incident.rows_from_generated(events))
    prox = [i for i in view["items"] if i["event_type"] == "potential_interaction"]
    assert prox and all(i["display"] == "neutral" and i["event_type"] != "possible_collision" for i in prox)
    assert view["contact_status"] == "insufficient_evidence"


def test_accident_cue_alone_adds_no_collision():
    a = track(1, "car", lambda k: (50 + 30 * k, 200), 30)
    b = track(2, "car", lambda k: (900, 900), 30)
    view = incident.build_view(incident.rows_from_generated(gen([a, b], cues=[(2000.0, 0.99)])))
    assert not any(i["event_type"] in ("possible_collision", "visually_supported_contact", "collision") for i in view["items"])
    assert all(i["display"] != "critical" for i in view["items"])


def test_duplicate_merging_and_timeline_timestamps():
    first = row(id="evt_a", source_event_id="se_a", start_ms=1000, end_ms=1200, frames=[10, 12])
    second = row(id="evt_b", source_event_id="se_b", start_ms=1300, end_ms=1800, frames=[14, 18])
    other = row(id="evt_c", source_event_id="se_c", track_ids=[4], track_classes=["car"], start_ms=1000, end_ms=1800)
    other_file = row(id="evt_d", source_event_id="se_d", evidence_id="ev_2", start_ms=1000, end_ms=1800)
    loose = row(id="evt_u", source_event_id="se_u", start_ms=None, end_ms=None)
    view = incident.build_view([second, loose, other_file, other, first])
    merged = [i for i in view["items"] if i["event_type"] == "possible_collision" and i["evidence_id"] == "ev_1" and i["track_ids"] == [4, 9]]
    assert len(merged) == 1
    assert set(merged[0]["merged_from"]) == {"se_a", "se_b"}
    assert merged[0]["start_ms"] == 1000 and merged[0]["end_ms"] == 1800
    assert merged[0]["frames"] == [10, 18]
    assert [i["id"] for i in view["items"] if i["track_ids"] == [4]] == ["evt_c"]
    assert any(i["evidence_id"] == "ev_2" for i in view["items"])
    assert [i["id"] for i in view["unplaced"]] == ["evt_u"]
    assert view["unplaced"][0]["start_ms"] is None and view["unplaced"][0]["synchronized"] is False
    placed = [i["start_ms"] for i in view["items"]]
    assert placed == sorted(placed)


def test_continuation_candidates_stay_separate_tracks():
    a = row(id="evt_4", source_event_id="se_4", track_ids=[4], track_classes=["car"])
    b = row(id="evt_7", source_event_id="se_7", track_ids=[7], track_classes=["car"], start_ms=1100, end_ms=1400)
    view = incident.build_view([a, b])
    assert {tuple(i["track_ids"]) for i in view["items"]} == {(4,), (7,)}
    assert len(view["items"]) == 2


def test_no_collision_candidate_is_insufficient():
    prox = row(event_type="potential_interaction", title="Possible interaction between tracked road users", rule_id="VID-INTER-01",
               observations={"relation": "proximity", "coordinate_frame": "image_pixels", "note": "image-space proximity or box overlap is not physical contact or distance"})
    view = incident.build_view([prox])
    assert view["contact_status"] == "insufficient_evidence"
    assert view["deterministic"]["headline"] == "No collision or near miss was identified in the analysed evidence."
    assert any(s["classification"] == "insufficient" for s in view["deterministic"]["sentences"])
    assert all(i["display"] != "critical" for i in view["items"])


def test_narrative_validator_rejects_banned_wording_and_leaves_the_headline(client):
    case, scn = _case(client)
    settings = get_settings()
    bad = json.dumps({"sentences": [{"text": "The driver was at fault for a collision.", "classification": "inferred", "event_ids": ["evt_a"], "evidence_ids": ["ev_1"]}]})
    with client.factory() as db:
        case_row = db.get(Case, case["id"])
        scn_row = db.get(ReconstructionScenario, scn["id"])
        before = incident.view_for_scenario(db, scn_row)["deterministic"]["headline"]
        fake = FakeClient(content=bad)
        doc = incident.narrate(db, case_row, scn_row, fake, settings)
    assert doc["ai_narrative"] is None
    assert doc["ai_narrative_status"] == "unavailable" and doc["ai_narrative_reason"] == "validation_failed"
    assert doc["deterministic"]["headline"] == before
    assert fake.validation == [(7, False)]
    assert fake.calls[0]["model"] == settings.featherless_text_model


def test_featherless_failure_keeps_the_deterministic_summary(client):
    case, scn = _case(client)
    settings = get_settings()
    with client.factory() as db:
        case_row = db.get(Case, case["id"])
        scn_row = db.get(ReconstructionScenario, scn["id"])
        before = incident.read_narrative(db, scn_row)["deterministic"]["headline"]
        missing = FakeClient(exc=NotConfigured("FEATHERLESS_API_KEY is not set"))
        doc = incident.narrate(db, case_row, scn_row, missing, settings)
        blocked = FakeClient(exc=PolicyBlocked("blocked"))
        denied = incident.narrate(db, case_row, scn_row, blocked, settings)
    assert doc["ai_narrative_status"] == "unavailable" and doc["ai_narrative_reason"] == "not_configured" and doc["ai_narrative"] is None
    assert doc["hypothesis_explanation"]["items"] == []
    assert doc["deterministic"]["headline"] == before
    assert denied["ai_narrative_reason"] == "policy_blocked" and denied["ai_narrative"] is None and denied["deterministic"]["headline"] == before
    assert denied["hypothesis_explanation"]["items"] == []
    assert len(missing.calls) == 1 and len(blocked.calls) == 1
    sent = json.loads(missing.calls[0]["messages"][1]["content"])
    assert sent["hypotheses"] == []
    assert settings.featherless_vision_model not in {c["model"] for c in missing.calls + blocked.calls}
    stored = json.dumps(doc)
    assert "substitute" not in stored and "As an AI" not in stored


def test_report_validation_passes_with_the_narrative_absent(client):
    case, _scn = _case(client)
    report = client.post(f"/api/v1/cases/{case['id']}/reports", json={"format": "full"})
    assert report.status_code == 201, report.text
    body = report.json()
    assert body["validation"]["passed"] is True
    dumped = json.dumps(body["content"])
    assert "ai_narrative" not in dumped and "incident_narrative" not in dumped
    narrative = client.get(f"/api/v1/cases/{case['id']}/incident-narrative").json()
    assert narrative["ai_narrative"] is None
    assert "does not determine fault" in dumped


def test_car_class_has_no_plate_or_make():
    view = incident.build_view([row(event_type="vehicle_slowing", title="A tracked vehicle appears to slow", rule_id="VID-SLOW-01",
                                    track_ids=[4], track_classes=["car"], observations={"class": "car", "motion": "slowing", "coordinate_frame": "image_pixels"})])
    item = view["items"][0]
    assert item["track_classes"] == ["car"]
    assert "plate" not in item and "make" not in item and "model" not in item
    assert "Vehicle B" not in json.dumps(view) and "white car" not in json.dumps(view)


def test_api_merges_duplicates_and_serves_real_frames(client):
    case, scn = _case(client)
    uploaded = client.post(
        f"/api/v1/cases/{case['id']}/evidence",
        files={"file": ("clip.txt", b"real source\n")},
        data={"kind": "witness_text", "synthetic": "false"},
    )
    assert uploaded.status_code == 201, uploaded.text
    evidence_id = uploaded.json()["evidence"]["id"]
    with client.factory() as db:
        db.add(ExtractedFrame(evidence_id=evidence_id, frame_no=71, time_ms=1583, thumbnail_path="derived/thumb.jpg", sampled=True))
        rows = [
            Event(case_id=case["id"], scenario_id=scn["id"], category="machine_detection", event_type="possible_collision",
                  title="Possible collision between tracked vehicles", start_case_ms=1583, end_case_ms=1583, uncertainty_ms=100,
                  uncertainty_basis="sampling", source_type="video_cctv", source_id=evidence_id, synthetic=False,
                  observations={"track_ids": [4, 9], "track_classes": ["car", "car"], "frames": [71, 71], "frame_times_ms": [1583, 1583],
                                "relation": "box_overlap", "abrupt_speed_changes": [{"track_id": 4}], "coordinate_frame": "image_pixels"},
                  confidence={"timestamp": "synchronized"}, provenance={"source_event_id": "se_one", "rule_id": "VID-COLL-01"}),
            Event(case_id=case["id"], scenario_id=scn["id"], category="machine_detection", event_type="possible_collision",
                  title="Possible collision between tracked vehicles", start_case_ms=1700, end_case_ms=1900, uncertainty_ms=100,
                  uncertainty_basis="sampling", source_type="video_cctv", source_id=evidence_id, synthetic=False,
                  observations={"track_ids": [4, 9], "track_classes": ["car", "car"], "frames": [80, 90], "frame_times_ms": [1700, 1900],
                                "relation": "box_overlap", "coordinate_frame": "image_pixels"},
                  confidence={"timestamp": "synchronized"}, provenance={"source_event_id": "se_two", "rule_id": "VID-COLL-01"}),
        ]
        db.add_all(rows)
        db.flush()
        for event in rows:
            db.add(EventSource(event_id=event.id, evidence_id=evidence_id, kind="metadata"))
        kept = rows[0].id
        db.commit()
    listed = client.get(f"/api/v1/cases/{case['id']}/incident-events")
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["start_ms"] == 1583 and item["end_ms"] == 1900
    assert set(item["merged_from"]) == {"se_one", "se_two"}
    assert item["track_classes"] == ["car", "car"] and "plate" not in item and "make" not in item
    assert item["display"] == "amber" and item["classification"] == "inferred"
    frames = client.get(f"/api/v1/cases/{case['id']}/incident-frames", params={"event_id": item["id"]})
    assert frames.status_code == 200, frames.text
    got = frames.json()["items"]
    assert [f["frame_no"] for f in got] == [71]
    assert got[0]["thumbnail_url"].endswith("/image") and got[0]["full_url"].endswith("full=true")
    assert got[0]["time_ms"] == 1583
    missing = client.get("/api/v1/cases/missing/incident-events")
    empty = client.post("/api/v1/cases", json={"title": "Bare", "designation": "real"}).json()
    bare = client.get(f"/api/v1/cases/{empty['id']}/incident-events")
    assert bare.status_code == 409 and bare.json()["error"]["code"] == "NO_RECONSTRUCTION"
    assert missing.status_code == 404
    narrative = client.get(f"/api/v1/cases/{case['id']}/incident-narrative").json()
    assert narrative["ai_narrative"] is None and narrative["ai_narrative_status"] == "unavailable"
    assert narrative["deterministic"]["headline"]
    assert kept
    with client.factory() as db:
        assert db.execute(select(Event.id).where(Event.scenario_id == scn["id"])).scalars().all()


def test_synthetic_real_separation_is_unchanged(client):
    real = client.post("/api/v1/cases", json={"title": "Real", "designation": "real"}).json()
    rejected = client.post(
        f"/api/v1/cases/{real['id']}/evidence",
        files={"file": ("notes.txt", b"synthetic note\n")},
        data={"kind": "witness_text", "synthetic": "true"},
    )
    assert rejected.status_code == 422 and rejected.json()["error"]["code"] == "SYNTHETIC_IN_REAL_CASE"
    synthetic = client.post("/api/v1/cases", json={"title": "Synthetic", "designation": "synthetic"}).json()
    kept = client.post(
        f"/api/v1/cases/{synthetic['id']}/evidence",
        files={"file": ("notes.txt", b"synthetic note\n")},
        data={"kind": "witness_text", "synthetic": "true"},
    )
    assert kept.status_code == 201 and kept.json()["evidence"]["synthetic"] is True
