"""Source description is editable. The original file is not. Fixtures are synthetic text and a generated clip, not real footage."""
from app.services.sources import annotation_edges


def _case(client):
    return client.post("/api/v1/cases", json={"title": "Sources", "designation": "synthetic"}).json()


def _note(client, case_id, body=b"witness note about the junction\n", name="note.txt"):
    return client.post(
        f"/api/v1/cases/{case_id}/evidence",
        files={"file": (name, body)},
        data={"kind": "witness_text", "synthetic": "true"},
    )


def test_annotation_offset_becomes_an_edge_only_with_a_reference():
    rows = [
        {"evidence_id": "ev_b", "clock_offset_ms": 1500, "clock_offset_reference_id": "ev_a"},
        {"evidence_id": "ev_c", "clock_offset_ms": 20, "clock_offset_reference_id": None},
        {"evidence_id": "ev_d", "clock_offset_ms": None, "clock_offset_reference_id": "ev_a"},
    ]
    edges = annotation_edges(rows)
    assert edges == [{
        "id": "ann:ev_b", "a_evidence": "ev_a", "b_evidence": "ev_b", "offset_ms": 1500.0,
        "bound_ms": 0.0, "basis": "known_offset", "status": "declared",
    }]


def test_source_fields_edit_without_touching_the_file(client):
    case = _case(client)
    uploaded = _note(client, case["id"])
    assert uploaded.status_code == 201, uploaded.text
    ev = uploaded.json()["evidence"]
    assert ev["source"]["source_id"] == ev["id"]
    assert ev["source"]["original_filename"] == "note.txt"
    assert ev["source"]["processing_kind"] == "witness_text"
    assert ev["source"]["camera_role"] is None
    patched = client.patch(f"/api/v1/evidence/{ev['id']}/source", json={
        "display_name": "North camera",
        "location_text": "north corner, investigator's label",
        "timezone": "Asia/Kolkata",
        "recording_start": "2026-10-30T10:00:00+05:30",
        "recording_end": "2026-10-30T10:05:00+05:30",
        "camera_role": "cctv",
    })
    assert patched.status_code == 200, patched.text
    source = patched.json()["source"]
    assert source["display_name"] == "North camera"
    assert source["location_text"] == "north corner, investigator's label"
    assert source["timezone"] == "Asia/Kolkata"
    assert source["camera_role"] == "cctv"
    assert source["recording_start"].startswith("2026-10-30T10:00:00")
    again = client.get(f"/api/v1/evidence/{ev['id']}").json()
    assert again["original_filename"] == "note.txt"
    assert again["kind"] == "witness_text"
    assert again["sha256"] == ev["sha256"]


def test_offset_requires_a_reference_in_the_same_case(client):
    case = _case(client)
    a = _note(client, case["id"]).json()["evidence"]
    b = _note(client, case["id"], b"second note\n", "other.txt").json()["evidence"]
    missing = client.patch(f"/api/v1/evidence/{b['id']}/source", json={"clock_offset_ms": 400})
    assert missing.status_code == 422 and missing.json()["error"]["code"] == "OFFSET_REFERENCE_REQUIRED"
    saved = client.patch(f"/api/v1/evidence/{b['id']}/source", json={"clock_offset_ms": 400, "clock_offset_reference_id": a["id"]})
    assert saved.status_code == 200, saved.text
    assert saved.json()["source"]["clock_offset_ms"] == 400
    assert saved.json()["source"]["clock_offset_basis"] == "declared_by_investigator"
    assert saved.json()["kind"] == "witness_text"


def test_duplicate_bytes_stay_one_source(client):
    case = _case(client)
    body = b"same bytes\n"
    first = _note(client, case["id"], body, "a.txt")
    second = _note(client, case["id"], body, "b.txt")
    assert first.status_code == 201 and second.status_code == 200
    assert second.json()["duplicate"] is True
    assert second.json()["evidence"]["id"] == first.json()["evidence"]["id"]
    listed = client.get(f"/api/v1/cases/{case['id']}/evidence").json()["items"]
    assert len(listed) == 1


def test_other_video_is_stored_and_not_sent_to_tracking(client, sample_video):
    case = _case(client)
    raw = sample_video.read_bytes()
    uploaded = client.post(
        f"/api/v1/cases/{case['id']}/evidence",
        files={"file": ("angle.mp4", raw, "video/mp4")},
        data={"kind": "other", "synthetic": "true"},
    )
    assert uploaded.status_code == 201, uploaded.text
    ev = uploaded.json()["evidence"]
    assert ev["source"]["camera_role"] == "other"
    assert ev["source"]["processing_kind"] == "other"
    detail = client.get(f"/api/v1/evidence/{ev['id']}").json()
    assert detail["status"] == "valid"
    assert detail["video"]["duration_ms"] is not None
    jobs = client.get(f"/api/v1/cases/{case['id']}/jobs").json()["items"]
    assert {j["stage"] for j in jobs} == {"validate"}
    original = client.get(f"/api/v1/evidence/{ev['id']}/original?verify=true")
    assert original.status_code == 200
    assert original.headers["x-content-sha256"] == ev["sha256"]
