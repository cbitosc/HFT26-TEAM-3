"""A real investigation refuses evidence declared synthetic. The check is on the API, not a browser flag."""


def _case(client, designation):
    return client.post("/api/v1/cases", json={"title": f"{designation} case", "designation": designation}).json()


def _upload(client, case_id, synthetic, body=b"a real-looking note\n"):
    return client.post(
        f"/api/v1/cases/{case_id}/evidence",
        files={"file": ("notes.txt", body)},
        data={"kind": "witness_text", "synthetic": "true" if synthetic else "false"},
    )


def test_real_upload_into_a_real_case_is_kept(client):
    case = _case(client, "real")
    r = _upload(client, case["id"], False)
    assert r.status_code == 201, r.text
    assert r.json()["evidence"]["synthetic"] is False


def test_synthetic_upload_into_a_real_case_is_rejected(client):
    case = _case(client, "real")
    r = _upload(client, case["id"], True)
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "SYNTHETIC_IN_REAL_CASE"
    assert "real" in err["message"] and "synthetic" in err["message"]


def test_synthetic_upload_into_a_synthetic_case_is_kept(client):
    case = _case(client, "synthetic")
    r = _upload(client, case["id"], True)
    assert r.status_code == 201, r.text
    assert r.json()["evidence"]["synthetic"] is True


def test_mixed_case_keeps_both_declarations(client):
    case = _case(client, "mixed")
    real = _upload(client, case["id"], False, b"field notes from the scene\n")
    synthetic = _upload(client, case["id"], True, b"generated demonstration note\n")
    assert real.status_code == 201 and synthetic.status_code == 201
    flags = {real.json()["evidence"]["synthetic"], synthetic.json()["evidence"]["synthetic"]}
    assert flags == {False, True}


def test_direct_api_bypass_on_a_witness_statement_is_rejected(client):
    """The same rule on a typed statement, which never passes through the upload form."""
    case = _case(client, "real")
    witness = client.post(f"/api/v1/cases/{case['id']}/witnesses", json={"label": "Witness A"}).json()
    r = client.post(f"/api/v1/witnesses/{witness['id']}/statements", json={"text": "I saw a car stop.", "synthetic": True})
    assert r.status_code == 422 and r.json()["error"]["code"] == "SYNTHETIC_IN_REAL_CASE"
    kept = client.post(f"/api/v1/witnesses/{witness['id']}/statements", json={"text": "I saw a car stop.", "synthetic": False})
    assert kept.status_code == 201, kept.text
