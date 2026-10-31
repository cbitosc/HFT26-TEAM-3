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
