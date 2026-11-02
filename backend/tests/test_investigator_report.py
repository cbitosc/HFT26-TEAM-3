"""Investigator report: four sections, smaller than the full export, every finding cites a stored event."""
from sqlalchemy import select

from app.models import Event, EventSource


def _event(case_id, scenario_id, evidence_id, event_type, start, title):
    return Event(
        case_id=case_id, scenario_id=scenario_id, category="machine_detection", event_type=event_type, title=title,
        start_case_ms=start, end_case_ms=start, uncertainty_ms=100, uncertainty_basis="sampling",
        source_type="video_cctv", source_id=evidence_id,
        observations={"note": "image-space proximity or box overlap is not physical contact or distance"},
        confidence={"timestamp": "unsynchronized"}, provenance={"source_event_id": None}, synthetic=False,
    )


def test_empty_investigator_report_has_the_four_sections(client):
    case = client.post("/api/v1/cases", json={"title": "Empty", "designation": "real"}).json()
    client.post(f"/api/v1/cases/{case['id']}/reconstruction/scenarios", json={"name": "baseline"})
    r = client.post(f"/api/v1/cases/{case['id']}/reports", json={"format": "investigator"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["validation"]["passed"] is True and body["has_pdf"] is True
    titles = [s["title"] for s in body["content"]["sections"]]
    assert titles == ["Executive summary", "Key timeline", "Findings", "Evidence appendix"]
    assert body["content"]["sections"][1]["entries"] == [] and body["content"]["sections"][2]["items"] == []
    assert body["content"]["stored_event_count"] == 0
    md = client.get(f"/api/v1/reports/{body['id']}/markdown").text
    assert "Executive summary" in md and "No key events" in md and "No findings" in md


def test_investigator_report_is_smaller_and_every_finding_cites_stored_events(client):
    case = client.post("/api/v1/cases", json={"title": "Busy", "designation": "real"}).json()
    scn = client.post(f"/api/v1/cases/{case['id']}/reconstruction/scenarios", json={"name": "baseline"}).json()
    uploaded = client.post(
        f"/api/v1/cases/{case['id']}/evidence",
        files={"file": ("clip.txt", b"placeholder source\n")},
        data={"kind": "witness_text", "synthetic": "false"},
    )
    assert uploaded.status_code == 201, uploaded.text
    evidence_id = uploaded.json()["evidence"]["id"]
    with client.factory() as db:
        rows = [_event(case["id"], scn["id"], evidence_id, "potential_interaction", i * 200, "Possible interaction between tracked road users") for i in range(40)]
        rows.append(_event(case["id"], scn["id"], evidence_id, "possible_collision", 5000, "Possible collision candidate"))
        db.add_all(rows)
        db.flush()
        for row in rows:
            db.add(EventSource(event_id=row.id, evidence_id=evidence_id, kind="metadata"))
        db.commit()

    full = client.post(f"/api/v1/cases/{case['id']}/reports", json={"format": "full"})
    inv = client.post(f"/api/v1/cases/{case['id']}/reports", json={"format": "investigator"})
    assert full.status_code == 201 and inv.status_code == 201
    assert full.json()["validation"]["passed"] and inv.json()["validation"]["passed"]
    assert [s["title"] for s in full.json()["content"]["sections"]][0] == "Case overview"
    assert len(full.json()["content"]["sections"]) == 16

    full_md = client.get(f"/api/v1/reports/{full.json()['id']}/markdown").content
    inv_md = client.get(f"/api/v1/reports/{inv.json()['id']}/markdown").content
    full_pdf = client.get(f"/api/v1/reports/{full.json()['id']}/pdf").content
    inv_pdf = client.get(f"/api/v1/reports/{inv.json()['id']}/pdf").content
    assert len(inv_md) < len(full_md)
    assert len(inv_pdf) < len(full_pdf)

    content = inv.json()["content"]
    stored = set(content["stored_event_ids"])
    assert content["sections"][0]["counts"]["proximity_events_kept_in_store"] == 40
    assert len(stored) >= 41
    timeline_types = {e["event_type"] for e in content["sections"][1]["entries"]}
    assert timeline_types == {"possible_collision"}
    findings = content["sections"][2]["items"]
    assert findings and all(set(f["event_ids"]) <= stored and f["event_ids"] for f in findings)
    assert "potential_interaction" not in {f["event_type"] for f in findings}
    cited = {i for f in findings for i in f["event_ids"]}
    with client.factory() as db:
        rows = set(db.execute(select(Event.id).where(Event.scenario_id == scn["id"])).scalars())
    assert cited <= rows
