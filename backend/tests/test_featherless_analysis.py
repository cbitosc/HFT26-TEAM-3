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


# ------------------------------------------------------------------------------------------ retry on cut-off replies
import pytest  # noqa: E402
from app.api import featherless_analysis as api_fa  # noqa: E402


def _case(client, allow):
    return client.post("/api/v1/cases", json={"title": "Auto analysis", "designation": "real", "allow_external_inference": allow}).json()["id"]


def test_a_cut_off_reply_is_retried_once_with_more_room_and_a_stricter_hint(client):
    import json as _json

    from app.models import Case

    class Res:
        def __init__(self, content, call_id):
            self.content, self.call_id = content, call_id

    class Fake:
        def __init__(self):
            self.sent, self.valid = [], {}

        def chat(self, db, **kw):
            self.sent.append((kw["max_tokens"], len(kw["messages"])))
            n = len(self.sent)
            return Res('{"ok": 1' if n == 1 else '{"ok": 1}', n)  # the first reply is cut off

        def record_validation(self, db, call_id, ok):
            self.valid[call_id] = ok

    cid = _case(client, True)
    fake = Fake()
    with client.factory() as db:
        res, parsed = api_fa._ask(fake, db, case=db.get(Case, cid), model="m", messages=[{"role": "user", "content": "x"}], purpose="t", input_ref={"a": 1},
                                  max_tokens=100, settings=client.settings, parse=lambda c: fa_parse(c))
    assert parsed == {"ok": 1} and fake.sent == [(100, 1), (200, 2)] and fake.valid == {1: False, 2: True}


def fa_parse(content):
    import json as _json

    return _json.loads(content)


def test_two_bad_replies_raise_the_last_error(client):
    from app.models import Case

    class Res:
        content, call_id = "{broken", 1

    class Fake:
        def chat(self, db, **kw):
            return Res()

        def record_validation(self, db, call_id, ok):
            pass

    cid = _case(client, True)
    with client.factory() as db, pytest.raises(ValueError):
        api_fa._ask(Fake(), db, case=db.get(Case, cid), model="m", messages=[], purpose="t", input_ref={}, max_tokens=10, settings=client.settings, parse=fa_parse)

