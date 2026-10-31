"""End-to-end ingestion through the real API, a real database, a throwaway evidence store, and real ffmpeg-made videos."""
import hashlib
import os
import stat

from sqlalchemy import text

from app.models import EvidenceFile
from app.services import audit, jobs

CSV = b"timestamp,speed_mps,accel_x\n0.0,10.0,0.1\n0.1,10.1,0.0\n0.2,9.0,-5.2\n"


def make_case(client, **kw):
    body = {"title": "Intersection test", "designation": "synthetic"} | kw
    r = client.post("/api/v1/cases", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def upload(client, case_id, name, data, kind, synthetic=True, **extra):
    return client.post(f"/api/v1/cases/{case_id}/evidence", files={"file": (name, data, "application/octet-stream")},
                       data={"kind": kind, "synthetic": str(synthetic).lower(), **extra})


# ------------------------------------------------------------------------------------------------ cases
def test_case_lifecycle_and_errors(client):
    c = make_case(client, allow_external_inference=False)
    assert c["code"].startswith("TL-") and c["allow_external_inference"] is False
    assert client.get(f"/api/v1/cases/{c['id']}").json()["counts"]["evidence_total"] == 0
    assert len(client.get("/api/v1/cases").json()["items"]) == 1

    r = client.patch(f"/api/v1/cases/{c['id']}", json={"allow_external_inference": True})
    assert r.json()["allow_external_inference"] is True

    missing = client.get("/api/v1/cases/case_nope")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "CASE_NOT_FOUND"
    bad = client.post("/api/v1/cases", json={"title": "", "designation": "imaginary"})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "VALIDATION_ERROR"
    assert client.post("/api/v1/cases", json={"title": "x", "designation": "real", "code": c["code"]}).status_code == 409


# ------------------------------------------------------------------------------------------------ upload + validation
def test_csv_upload_hash_readonly_original_and_validation(client):
    case = make_case(client)
    r = upload(client, case["id"], "imu.csv", CSV, "sensor_csv")
    assert r.status_code == 201
    ev = r.json()["evidence"]
    assert ev["sha256"] == hashlib.sha256(CSV).hexdigest() and ev["size_bytes"] == len(CSV)

    detail = client.get(f"/api/v1/evidence/{ev['id']}").json()  # background validation has already run
    assert detail["status"] == "valid"
    assert detail["validation"]["metadata"]["rows"] == 3 and detail["validation"]["metadata"]["columns"] == ["timestamp", "speed_mps", "accel_x"]

    stored = client.settings.storage_path / f"originals/{ev['sha256'][:2]}/{ev['sha256']}"
    assert stored.read_bytes() == CSV
    assert not (stored.stat().st_mode & (stat.S_IWUSR | stat.S_IWGRP | stat.S_IWOTH))  # read-only

    dl = client.get(ev["links"]["original"] + "?verify=true")
    assert dl.status_code == 200 and dl.content == CSV and dl.headers["x-content-sha256"] == ev["sha256"]


def test_video_metadata_extracted(client, sample_video):
    case = make_case(client)
    r = upload(client, case["id"], "dash.mp4", sample_video.read_bytes(), "dashcam")
    assert r.status_code == 201, r.text
    detail = client.get(f"/api/v1/evidence/{r.json()['evidence']['id']}").json()
    assert detail["status"] == "valid", detail["validation"]
    v = detail["video"]
    assert (v["width"], v["height"], v["codec"]) == (320, 240, "h264")
    assert abs(v["fps_nominal"] - 15) < 0.01 and 1900 <= v["duration_ms"] <= 2200
    assert "not a verified or synchronized time" in v["note"]
    listed = client.get(f"/api/v1/cases/{case['id']}/evidence").json()["items"][0]
    assert listed["video"]["width"] == 320


def test_dropped_frames_are_reported_as_warning(client, gappy_video):
    case = make_case(client)
    ev = upload(client, case["id"], "gappy.mp4", gappy_video.read_bytes(), "cctv").json()["evidence"]
    detail = client.get(f"/api/v1/evidence/{ev['id']}").json()
    assert detail["status"] == "valid"
    assert detail["validation"]["checks"]["pts_gap_count"] >= 1
    assert any("timestamp gap" in w for w in detail["validation"]["warnings"])


def test_corrupt_video_is_kept_but_marked_invalid(client):
    case = make_case(client)
    junk = b"\x00\x00\x00\x18ftypmp42" + os.urandom(4000)
    ev = upload(client, case["id"], "broken.mp4", junk, "dashcam").json()["evidence"]
    detail = client.get(f"/api/v1/evidence/{ev['id']}").json()
    assert detail["status"] == "invalid" and detail["validation"]["errors"]
    assert client.get(ev["links"]["original"]).content == junk  # never discarded
    job = client.get(f"/api/v1/cases/{case['id']}/jobs").json()["items"][0]
    assert job["status"] == "completed"  # the job did its work; the evidence is what's invalid


def test_malformed_csv_is_invalid(client):
    case = make_case(client)
    bad = b"t,speed\n0,1\n1\n2,3,4\n"
    ev = upload(client, case["id"], "bad.csv", bad, "sensor_csv").json()["evidence"]
    d = client.get(f"/api/v1/evidence/{ev['id']}").json()
    assert d["status"] == "invalid" and "different number of columns" in d["validation"]["errors"][0]


def test_ground_truth_is_stored_but_flagged_excluded(client):
    case = make_case(client)
    ev = upload(client, case["id"], "truth.json", b'{"events": []}', "ground_truth").json()["evidence"]
    d = client.get(f"/api/v1/evidence/{ev['id']}").json()
    assert d["validation"]["metadata"]["excluded_from_processing"] is True


# ------------------------------------------------------------------------------------------------ rejections
def test_content_must_match_declared_kind(client, sample_video):
    case = make_case(client)
    assert upload(client, case["id"], "a.mp4", CSV, "dashcam").status_code == 415  # csv declared as video
    assert upload(client, case["id"], "a.csv", sample_video.read_bytes()[:2000], "sensor_csv").status_code == 415
    assert upload(client, case["id"], "a.txt", os.urandom(512) + b"\x00", "witness_text").status_code == 415
    r = upload(client, case["id"], "notes.csv", b"just some prose without a delimiter\n", "sensor_csv")
    assert r.status_code == 415 and r.json()["error"]["code"] == "UNSUPPORTED_CONTENT"
    assert client.get(f"/api/v1/cases/{case['id']}/evidence").json()["items"] == []


def test_size_limit_empty_file_and_missing_flag(client):
    case = make_case(client)
    big = upload(client, case["id"], "big.csv", b"a,b\n" + b"1,2\n" * 400_000, "sensor_csv")  # ~1.6 MB > 1 MB limit
    assert big.status_code == 413 and big.json()["error"]["code"] == "FILE_TOO_LARGE"
    assert upload(client, case["id"], "e.csv", b"", "sensor_csv").status_code == 422
    r = client.post(f"/api/v1/cases/{case['id']}/evidence", files={"file": ("a.csv", CSV)}, data={"kind": "sensor_csv"})
    assert r.status_code == 422 and any("synthetic" in f["field"] for f in r.json()["error"]["details"]["fields"])
    assert upload(client, case["id"], "a.csv", CSV, "not_a_kind").status_code == 422
    store = client.settings.storage_path
    assert list((store / "tmp").iterdir()) == []  # nothing left behind by rejected uploads


def test_hostile_filename_never_reaches_the_filesystem(client):
    case = make_case(client)
    ev = upload(client, case["id"], "../../../../tmp/evil.csv", CSV, "sensor_csv").json()["evidence"]
    assert ev["original_filename"] == "evil.csv"
    assert ev["links"]["original"].startswith("/api/v1/evidence/")
    stored = client.settings.storage_path / f"originals/{ev['sha256'][:2]}/{ev['sha256']}"
    assert stored.is_file() and not os.path.exists("/tmp/evil.csv")


def test_closed_case_rejects_new_evidence(client):
    case = make_case(client)
    client.patch(f"/api/v1/cases/{case['id']}", json={"status": "closed"})
    assert upload(client, case["id"], "a.csv", CSV, "sensor_csv").status_code == 409


# ------------------------------------------------------------------------------------------------ duplicates, ranges, integrity
def test_duplicates(client):
    a, b = make_case(client), make_case(client, title="Second")
    first = upload(client, a["id"], "one.csv", CSV, "sensor_csv")
    again = upload(client, a["id"], "renamed.csv", CSV, "sensor_csv")
    assert first.status_code == 201 and again.status_code == 200 and again.json()["duplicate"] is True
    assert again.json()["evidence"]["id"] == first.json()["evidence"]["id"]
    assert len(client.get(f"/api/v1/cases/{a['id']}/jobs").json()["items"]) == 1  # no second job
    with client.factory() as s:  # the duplicate is recorded for the audit trail (written by the pre-check, not the DB constraint)
        assert s.execute(text("SELECT count(*) FROM audit_log WHERE action = 'duplicate_upload'")).scalar() == 1

    other = upload(client, b["id"], "one.csv", CSV, "sensor_csv")  # same bytes in another case: new record, shared stored file
    assert other.status_code == 201 and other.json()["evidence"]["id"] != first.json()["evidence"]["id"]
    with client.factory() as s:
        paths = {e.stored_path for e in s.query(EvidenceFile).all()}
    assert len(paths) == 1


def test_range_requests_for_video_playback(client, sample_video):
    case = make_case(client)
    ev = upload(client, case["id"], "dash.mp4", sample_video.read_bytes(), "dashcam").json()["evidence"]
    r = client.get(ev["links"]["original"], headers={"Range": "bytes=0-99"})
    assert r.status_code == 206 and len(r.content) == 100 and r.headers["content-range"].startswith("bytes 0-99/")
    assert r.content == sample_video.read_bytes()[:100]


def test_tampered_original_is_detected_and_audited(client):
    case = make_case(client)
    ev = upload(client, case["id"], "imu.csv", CSV, "sensor_csv").json()["evidence"]
    stored = client.settings.storage_path / f"originals/{ev['sha256'][:2]}/{ev['sha256']}"
    os.chmod(stored, 0o644)
    stored.write_bytes(CSV + b"9.9,9.9,9.9\n")  # someone edits the file on disk
    r = client.get(ev["links"]["original"] + "?verify=true")
    assert r.status_code == 409 and r.json()["error"]["code"] == "INTEGRITY_MISMATCH"
    with client.factory() as s:
        actions = [a for (a,) in s.execute(text("SELECT action FROM audit_log ORDER BY id"))]
    assert "integrity_failure" in actions


# ------------------------------------------------------------------------------------------------ witnesses
def test_typed_statement_is_stored_exactly(client):
    case = make_case(client)
    w = client.post(f"/api/v1/cases/{case['id']}/witnesses", json={"label": "Witness A"}).json()
    text_ = "  I saw the blue car turn left just before the collision.\r\nThe other vehicle was moving very fast.  \n"
    st = client.post(f"/api/v1/witnesses/{w['id']}/statements", json={"text": text_, "synthetic": True})
    assert st.status_code == 201 and st.json()["text_original"] == text_  # no trimming or newline changes
    assert client.get(f"/api/v1/statements/{st.json()['id']}").json()["text_original"] == text_
    assert len(client.get(f"/api/v1/witnesses/{w['id']}/statements").json()["items"]) == 1
    assert client.post(f"/api/v1/witnesses/nope/statements", json={"text": "x", "synthetic": True}).status_code == 404
    # no update/delete endpoint exists for statements
    assert client.put(f"/api/v1/statements/{st.json()['id']}", json={"text": "edited"}).status_code == 405


def test_uploaded_statement_becomes_evidence_and_statement(client):
    case = make_case(client)
    w = client.post(f"/api/v1/cases/{case['id']}/witnesses", json={"label": "Witness B"}).json()
    data = "The first car kept going straight.\n".encode()
    r = client.post(f"/api/v1/witnesses/{w['id']}/statements/upload", files={"file": ("b.txt", data)}, data={"synthetic": "true"})
    assert r.status_code == 201 and r.json()["statement"]["text_original"] == data.decode()
    ev = client.get(f"/api/v1/cases/{case['id']}/evidence").json()["items"][0]
    assert ev["kind"] == "witness_text" and ev["status"] == "valid"
    again = client.post(f"/api/v1/witnesses/{w['id']}/statements/upload", files={"file": ("b2.txt", data)}, data={"synthetic": "true"})
    assert again.json()["duplicate"] is True and again.json()["statement"]["id"] == r.json()["statement"]["id"]
    latin1 = client.post(f"/api/v1/witnesses/{w['id']}/statements/upload", files={"file": ("c.txt", "café\n".encode("latin-1"))}, data={"synthetic": "true"})
    assert latin1.status_code in (415, 422)


# ------------------------------------------------------------------------------------------------ jobs
def test_failed_job_is_recorded_and_retry_limited(client):
    case = make_case(client)
    ev = upload(client, case["id"], "imu.csv", CSV, "sensor_csv").json()["evidence"]
    stored = client.settings.storage_path / f"originals/{ev['sha256'][:2]}/{ev['sha256']}"
    # force a fresh validation job whose input file is gone
    with client.factory() as s:
        job = jobs.enqueue(s, case_id=case["id"], evidence_id=ev["id"], stage=jobs.STAGE_VALIDATE, input_hash=ev["sha256"], params={})
        s.commit()
        job_id = job.id
    os.chmod(stored, 0o644)
    stored.unlink()

    assert jobs.run_pending(client.factory, client.settings) == 1  # attempt 1
    j = client.get(f"/api/v1/jobs/{job_id}").json()
    assert j["status"] == "failed" and j["attempts"] == 1 and j["error"]["type"] == "FileNotFoundError"

    for expected_attempts in (2, 3):  # a retry re-queues the job; the API then runs it straight away
        r = client.post(f"/api/v1/jobs/{job_id}/retry")
        assert r.status_code == 202
        j = client.get(f"/api/v1/jobs/{job_id}").json()
        assert j["status"] == "failed" and j["attempts"] == expected_attempts

    r = client.post(f"/api/v1/jobs/{job_id}/retry")  # attempts exhausted
    assert r.status_code == 409 and r.json()["error"]["code"] == "JOB_NOT_RETRYABLE"
    assert client.get(f"/api/v1/jobs/{job_id}").json()["attempts"] == 3
    assert client.post("/api/v1/jobs/job_nope/retry").status_code == 404


# ------------------------------------------------------------------------------------------------ audit + dashboard
def test_audit_chain_verifies_and_detects_tampering(client, engine):
    case = make_case(client)
    upload(client, case["id"], "imu.csv", CSV, "sensor_csv")
    client.patch(f"/api/v1/cases/{case['id']}", json={"status": "review"})
    with client.factory() as s:
        ok, bad = audit.verify_chain(s)
        n = s.execute(text("SELECT count(*) FROM audit_log")).scalar()
    assert ok and bad is None and n >= 4  # case_created, evidence_uploaded, evidence_validated, case_updated

    with engine.begin() as conn:  # a privileged attacker disables the guard and edits history
        conn.execute(text("ALTER TABLE audit_log DISABLE TRIGGER tl_audit_guard"))
        conn.execute(text("UPDATE audit_log SET actor = 'someone-else' WHERE id = 2"))
        conn.execute(text("ALTER TABLE audit_log ENABLE TRIGGER tl_audit_guard"))
    with client.factory() as s:
        ok, bad = audit.verify_chain(s)
    assert not ok and bad == 2


def test_dashboard_counts_are_real(client):
    empty = client.get("/api/v1/dashboard").json()
    assert empty["cases"]["total"] == 0 and empty["evidence"]["total"] == 0 and empty["recent_evidence"] == []
    case = make_case(client)
    upload(client, case["id"], "imu.csv", CSV, "sensor_csv")
    upload(client, case["id"], "bad.csv", b"a,b\n1\n", "sensor_csv")
    d = client.get("/api/v1/dashboard").json()
    assert d["cases"]["total"] == 1 and d["evidence"]["total"] == 2 and d["evidence"]["invalid"] == 1
    assert d["jobs"]["by_status"]["completed"] == 2 and d["jobs"]["in_progress"] == 0
    c = client.get(f"/api/v1/cases/{case['id']}").json()["counts"]
    assert c["evidence_valid"] == 1 and c["evidence_invalid"] == 1
