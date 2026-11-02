"""Investigation report on synthetic scenario A (oracle boxes, manual claims)."""
import pytest

from app.services import report as rep
from tests.test_reconstruction import ROOT, big, build, items  # noqa: F401

pytestmark = pytest.mark.skipif(not (ROOT / "A_intersection_collision" / "manifest.json").exists(), reason="run scripts/build_scenarios.py first")


def make(c):
    run, scn = build(c)
    r = c.post(f"/api/v1/cases/{run['case_id']}/reports", json={}, headers={"X-Actor": "inspector"})
    assert r.status_code == 201, r.text
    return run, r.json()


def test_report_has_sixteen_validated_sections_and_a_pdf(big):
    run, r = make(big)
    assert r["validation"]["passed"], [c for c in r["validation"]["checks"] if not c["passed"]]
    secs = r["content"]["sections"]
    assert [s["number"] for s in secs] == list(range(1, 17)) and secs[1]["text"].startswith("This report supports an investigation")
    assert "SYNTHETIC" in secs[0]["facts"]["data_designation"]
    pdf = big.get(f"/api/v1/reports/{r['id']}/pdf")
    assert pdf.status_code == 200 and pdf.content[:5] == b"%PDF-" and len(pdf.content) > 2000
    md = big.get(f"/api/v1/reports/{r['id']}/markdown").text
    assert "## 12. Contradictions" in md and "CON-ACTION-01" in md and "does not determine which account is correct" in md
    assert "Not placed on the case clock" in md or secs[6]["unplaced"] == []


def test_report_keeps_layers_apart_and_lists_alternatives(big):
    run, r = make(big)
    secs = {s["title"]: s for s in r["content"]["sections"]}
    inf = secs["Inferences and alternatives"]["items"]
    assert inf and all(i["alternatives"] and i["premises"] for i in inf)
    assert all(c["independent"] for c in secs["Corroborations"]["items"])
    assert secs["Contradictions"]["items"][0]["benign_explanations"]
    assert any(c["quote"].startswith("I saw the blue car turn left") for c in secs["Witness statements and claims"]["claims"])
    assert "boxes come from a synthetic world model" in " ".join(str(x.get("note")) for x in secs["Methods and models"]["runs"])


def test_versions_increase_and_audit_records_it(big):
    run, r1 = make(big)
    r2 = big.post(f"/api/v1/cases/{run['case_id']}/reports", json={}).json()
    assert (r1["version"], r2["version"]) == (1, 2)
    assert [x["version"] for x in big.get(f"/api/v1/cases/{run['case_id']}/reports").json()["items"]] == [2, 1]


def test_validator_rejects_fault_language_and_missing_alternatives(big):
    run, r = make(big)
    import copy
    bad = copy.deepcopy(r["content"])
    bad["sections"][11]["items"][0]["text"] += " The blue driver was at fault."
    v = rep.validate(bad)
    assert not v["passed"] and any("fault" in c["check"] and not c["passed"] for c in v["checks"])
    bad2 = copy.deepcopy(r["content"])
    bad2["sections"][14]["items"][0]["alternatives"] = []
    assert not rep.validate(bad2)["passed"]
    bad3 = copy.deepcopy(r["content"])
    bad3["sections"][6]["unplaced"] = [{"time_s": 1.0, "source": "x", "uncertainty_s": 0}]
    assert not rep.validate(bad3)["passed"]
    bad4 = copy.deepcopy(r["content"])
    bad4["sections"][0]["facts"]["data_designation"] = "contains no synthetic data"
    assert not rep.validate(bad4)["passed"]
