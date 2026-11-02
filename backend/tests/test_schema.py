"""Database-level guarantees: immutability, append-only records, inference rules, span verification."""
import pytest
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import Range
from sqlalchemy.exc import DBAPIError

from app.models import (
    AuditLog,
    Camera,
    Case,
    Event,
    EventSource,
    EvidenceFile,
    InvestigationFinding,
    SensorRecord,
    SensorSource,
    Trajectory,
    Witness,
    WitnessClaim,
    WitnessStatement,
)

SHA_A = "a" * 64
SHA_B = "b" * 64


def make_case(s, code="C-1"):
    c = Case(code=code, title="t", designation="synthetic")
    s.add(c)
    s.flush()
    return c


def make_evidence(s, case, sha=SHA_A, kind="cctv"):
    e = EvidenceFile(case_id=case.id, kind=kind, original_filename="x.mp4", stored_path=f"originals/{sha[:2]}/{sha}",
                     size_bytes=10, sha256=sha, synthetic=True)
    s.add(e)
    s.flush()
    return e


def base_event(case, **kw):
    d = dict(case_id=case.id, category="machine_detection", event_type="vehicle_slowing", title="Track 7 appears to slow",
             uncertainty_ms=200, uncertainty_basis="frame_period", source_type="video_cctv", confidence={}, provenance={}, synthetic=True)
    d.update(kw)
    return Event(**d)


def make_detection_event(s, case, ev):
    e = base_event(case, source_id=ev.id)
    s.add(e)
    s.flush()
    s.add(EventSource(event_id=e.id, evidence_id=ev.id, kind="video_frames", frames=Range(10, 20)))
    s.flush()
    return e


CHECK_VIOLATION = ("23514",)
DB_REJECT = ("23514", "22023")  # check_violation, or invalid_parameter_value from jsonb_array_length


def fails(s, fn, codes=DB_REJECT):
    """The statement must be rejected by the database for the expected reason (not, e.g., a foreign-key error)."""
    with pytest.raises(DBAPIError) as exc:
        fn()
        s.flush()
    s.rollback()
    assert getattr(exc.value.orig, "sqlstate", None) in codes, f"rejected for the wrong reason: {exc.value.orig}"


def commit_fails(s, codes=DB_REJECT):
    with pytest.raises(DBAPIError) as exc:
        s.commit()
    s.rollback()
    assert getattr(exc.value.orig, "sqlstate", None) in codes, f"rejected for the wrong reason: {exc.value.orig}"


# ---------------------------------------------------------------- schema
def test_all_tables_created(engine):
    with engine.connect() as c:
        n = c.execute(text("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename <> 'alembic_version'")).scalar()
    assert n == 36  # includes source_annotations and vehicle_associations


def test_enum_checks_reject_bad_values(session):
    fails(session, lambda: session.add(Case(code="BAD", title="t", designation="imaginary")))


# ---------------------------------------------------------------- evidence immutability
def test_evidence_status_updatable_but_originals_immutable(session):
    ev = make_evidence(session, make_case(session))
    session.commit()
    ev.status = "valid"
    ev.validation = {"decodable": True}
    session.commit()  # allowed

    ev.sha256 = SHA_B
    commit_fails(session)

    session.delete(ev)
    commit_fails(session)


def test_duplicate_upload_same_case_rejected(session):
    case = make_case(session)
    make_evidence(session, case)
    session.commit()
    fails(session, lambda: session.add(EvidenceFile(case_id=case.id, kind="cctv", original_filename="y.mp4", stored_path="other/path",
                                                    size_bytes=1, sha256=SHA_A, synthetic=True)), codes=("23505",))


# ---------------------------------------------------------------- audit log
def test_audit_log_is_append_only(session):
    row = AuditLog(actor="tester", action="upload", entry_hash="h" * 64)
    session.add(row)
    session.commit()
    row.action = "tampered"
    commit_fails(session)
    session.delete(row)
    commit_fails(session)


# ---------------------------------------------------------------- events
def test_event_without_source_reference_rejected_at_commit(session):
    case = make_case(session)
    ev = make_evidence(session, case)
    session.add(base_event(case, source_id=ev.id))  # no EventSource row
    commit_fails(session)


def test_event_with_source_reference_commits(session):
    case = make_case(session)
    ev = make_evidence(session, case)
    make_detection_event(session, case, ev)
    session.commit()


def test_inference_rules(session):
    case = make_case(session)
    ev = make_evidence(session, case)
    premise = make_detection_event(session, case, ev)
    session.commit()

    def inference(**inf):
        return base_event(case, category="inference", source_type="engine", event_type="possible_evasive_action",
                          title="Possible evasive braking", inference=inf)

    # valid
    good = inference(rule_id="INF-EVASIVE-01", premises=[premise.id], alternatives=["braking for the signal"], statement="may")
    session.add(good)
    session.commit()

    # no alternatives
    fails(session, lambda: session.add(inference(rule_id="R", premises=[premise.id], alternatives=[], statement="x")))
    # no premises
    fails(session, lambda: session.add(inference(rule_id="R", premises=[], alternatives=["a"], statement="x")))
    # premise that does not exist
    fails(session, lambda: session.add(inference(rule_id="R", premises=["evt_missing"], alternatives=["a"], statement="x")))
    # premise that is itself an inference
    fails(session, lambda: session.add(inference(rule_id="R", premises=[good.id], alternatives=["a"], statement="x")))
    # inference detail on a non-inference event
    fails(session, lambda: session.add(base_event(case, source_id=ev.id, inference={"premises": [premise.id], "alternatives": ["a"]})))
    # inference category with a non-engine source
    fails(session, lambda: session.add(base_event(case, category="inference", inference={"premises": [premise.id], "alternatives": ["a"]})))


def test_events_are_append_only(session):
    case = make_case(session)
    ev = make_evidence(session, case)
    e = make_detection_event(session, case, ev)
    session.commit()

    e.review_status = "reviewed"
    session.commit()  # the one allowed change

    e.title = "rewritten"
    commit_fails(session)

    session.delete(e)
    commit_fails(session)


def test_event_time_order_and_uncertainty_checks(session):
    case = make_case(session)
    ev = make_evidence(session, case)
    session.commit()
    fails(session, lambda: session.add(base_event(case, source_id=ev.id, start_case_ms=5000, end_case_ms=4000)))
    fails(session, lambda: session.add(base_event(case, source_id=ev.id, uncertainty_ms=-1)))


# ---------------------------------------------------------------- witness statements and claims
def make_statement(s, case, text_="I saw the blue car turn left just before the collision."):
    w = Witness(case_id=case.id, label="Witness A")
    s.add(w)
    s.flush()
    st = WitnessStatement(witness_id=w.id, text_original=text_, source="typed", synthetic=True)
    s.add(st)
    s.flush()
    return st


def claim(st, start, end, src, **kw):
    return WitnessClaim(statement_id=st.id, char_start=start, char_end=end, source_text=src, extraction_status="valid", **kw)


def test_claim_span_must_match_original_text(session):
    st = make_statement(session, make_case(session))
    original = st.text_original
    span = "the blue car turn left"
    start = original.index(span)
    session.add(claim(st, start, start + len(span), span, subject="blue car", action="turn", direction="left"))
    session.commit()  # exact substring: accepted

    fails(session, lambda: session.add(claim(st, start, start + len(span), "the blue car turned right")))  # wrong text
    fails(session, lambda: session.add(claim(st, 0, 9999, original)))  # beyond the statement
    fails(session, lambda: session.add(claim(st, 5, 5, "")))  # empty span


def test_original_statement_cannot_be_modified_or_deleted(session):
    st = make_statement(session, make_case(session))
    session.commit()
    st.text_original = "edited"
    commit_fails(session)
    session.delete(st)
    commit_fails(session)


# ---------------------------------------------------------------- sensors
def test_raw_sensor_values_are_preserved(session):
    case = make_case(session)
    ev = make_evidence(session, case, kind="sensor_csv")
    src = SensorSource(case_id=case.id, evidence_id=ev.id, mapping={}, units={}, clock="relative", synthetic=True)
    session.add(src)
    session.flush()
    rec = SensorRecord(sensor_source_id=src.id, row_no=1, t_raw="12.345", values={"speed": 3.2})
    session.add(rec)
    session.commit()

    rec.time_ms = 12345  # derived fields may be filled in
    session.commit()

    rec.t_raw = "99"
    commit_fails(session)


# ---------------------------------------------------------------- findings and trajectories
def test_findings_must_reference_something(session):
    case = make_case(session)
    session.commit()
    fails(session, lambda: session.add(InvestigationFinding(case_id=case.id, kind="gap", ref_ids=[], text="x")))
    session.add(InvestigationFinding(case_id=case.id, kind="gap", ref_ids=["evt_1"], text="x"))
    session.commit()


def test_image_space_trajectory_needs_a_camera(session):
    case = make_case(session)
    session.commit()
    fails(session, lambda: session.add(Trajectory(case_id=case.id, frame="image", points=[])))
    cam = Camera(case_id=case.id, kind="cctv", label="CCTV 02")
    session.add(cam)
    session.flush()
    session.add(Trajectory(case_id=case.id, frame="image", camera_id=cam.id, points=[]))
    session.commit()
