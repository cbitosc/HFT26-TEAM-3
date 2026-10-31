import json

import pytest

from app.services.featherless_analysis import parse_findings, parse_narrative, parse_obd


def test_narrative_accepts_only_grounded_tracks_and_times():
    value = parse_narrative(json.dumps({
        "summary": "A tracked car moves through the sampled scene.",
        "events": [{"timestamp_ms": 1000, "end_ms": 1000, "title": "Car moving", "description": "Track 7 moves across the frame.", "track_ids": [7], "motion": "steady", "contact": "none_visible", "confidence": .8, "uncertainty": "Only sampled frames were supplied."}],
    }), duration_ms=5000, allowed_times={1000}, allowed_tracks={7})
    assert value["events"][0]["id"] == "ai-video-1"

    with pytest.raises(ValueError, match="unknown track"):
        parse_narrative(json.dumps({"summary": "x", "events": [{"timestamp_ms": 1000, "title": "x", "description": "x", "track_ids": [99], "motion": "steady", "contact": "unclear", "confidence": .5}]}), duration_ms=5000, allowed_times={1000}, allowed_tracks={7})


def test_obd_is_bounded_and_explicitly_synthetic():
    result = parse_obd(json.dumps({"vehicle_track_id": 7, "assumptions": ["Demo"], "records": [
        {"timestamp_ms": 0, "speed_kmh": 20, "accel_mps2": 0, "brake_pct": 0},
        {"timestamp_ms": 1000, "speed_kmh": 18, "accel_mps2": -1, "brake_pct": 20},
    ]}), duration_ms=5000, allowed_tracks={7})
    assert result["synthetic"] is True
    assert all(row["record_origin"] == "SIMULATED_DEMO" for row in result["records"])


def test_findings_cannot_reference_unknown_sources():
    content = json.dumps({"findings": [{"type": "contradiction", "timestamp_ms": 1000, "title": "Different movement descriptions", "explanation": "The two supplied sources disagree.", "source_refs": [{"kind": "witness", "id": "statement-1"}], "confidence": .7, "uncertainty": "Neither source is treated as truth."}]})
    with pytest.raises(ValueError, match="unknown source"):
        parse_findings(content, duration_ms=5000, allowed_refs=set())
    result = parse_findings(content, duration_ms=5000, allowed_refs={("witness", "statement-1")})
    assert result[0]["type"] == "contradiction"


# ------------------------------------------------------------------------------------------ automatic background analysis
from app.api import featherless_analysis as api_fa  # noqa: E402
from app.errors import AppError  # noqa: E402
from pydantic import SecretStr  # noqa: E402


def _case(client, allow):
    return client.post("/api/v1/cases", json={"title": "Auto analysis", "designation": "real", "allow_external_inference": allow}).json()["id"]


def test_auto_analysis_runs_only_for_a_case_that_allows_external_ai(client, monkeypatch):
    client.settings.featherless_api_key = SecretStr("test-key-value")
    calls = []
    monkeypatch.setattr(api_fa, "generate", lambda **kw: calls.append(kw["case"].id) or {"status": "ready"})
    off, on = _case(client, False), _case(client, True)
    api_fa.auto_generate(off, client.factory, client.settings)
    assert calls == []  # not allowed: nothing is generated, so nothing can be sent
    api_fa.auto_generate(on, client.factory, client.settings)
    assert calls == [on] and on not in api_fa.RUNNING


def test_auto_analysis_needs_a_key_and_records_a_failure_without_raising(client, monkeypatch):
    calls = []
    monkeypatch.setattr(api_fa, "generate", lambda **kw: calls.append(1) or {"status": "ready"})
    cid = _case(client, True)
    client.settings.featherless_api_key = None
    client.settings.featherless_api_key_fallback = None
    api_fa.auto_generate(cid, client.factory, client.settings)
    assert calls == []  # no key configured

    client.settings.featherless_api_key = SecretStr("test-key-value")
    def boom(**kw):
        raise AppError(409, "TRACKS_REQUIRED", "Run video detection and tracking before Featherless analysis")
    monkeypatch.setattr(api_fa, "generate", boom)
    api_fa.auto_generate(cid, client.factory, client.settings)
    assert cid not in api_fa.RUNNING
    body = client.get(f"/api/v1/cases/{cid}/featherless-analysis").json()
    assert body["status"] == "failed" and "TRACKS_REQUIRED" in body["error"]
    api_fa.FAILED.pop(cid, None)


def test_status_is_generating_while_a_background_analysis_runs(client):
    cid = _case(client, True)
    api_fa.RUNNING.add(cid)
    try:
        assert client.get(f"/api/v1/cases/{cid}/featherless-analysis").json() == {"status": "generating", "analysis": None}
    finally:
        api_fa.RUNNING.discard(cid)
    assert client.get(f"/api/v1/cases/{cid}/featherless-analysis").json()["status"] == "not_generated"


def test_building_a_reconstruction_starts_the_analysis_for_an_allowed_case_only(client, monkeypatch):
    client.settings.featherless_api_key = SecretStr("test-key-value")
    started = []
    monkeypatch.setattr(api_fa, "auto_generate", lambda case_id, factory, settings: started.append(case_id))
    off, on = _case(client, False), _case(client, True)
    assert client.post(f"/api/v1/cases/{off}/reconstruction/scenarios", json={"name": "Baseline"}).status_code == 201
    assert started == []
    assert client.post(f"/api/v1/cases/{on}/reconstruction/scenarios", json={"name": "Baseline"}).status_code == 201
    assert started == [on]
