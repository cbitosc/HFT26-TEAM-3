"""Actors, synchronization, scenarios, events and relations, trajectories, summaries, findings, reports."""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import INT4RANGE, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, new_id


class SourceAnnotation(Base):
    """Investigator description of a source. The evidence file itself stays immutable."""

    __tablename__ = "source_annotations"
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence_files.id"), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(160))
    location_text: Mapped[str | None] = mapped_column(Text)
    recording_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recording_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    timezone: Mapped[str | None] = mapped_column(String(64))
    camera_role: Mapped[str | None] = mapped_column(String(10))
    clock_offset_ms: Mapped[int | None] = mapped_column(Integer)
    clock_offset_reference_id: Mapped[str | None] = mapped_column(ForeignKey("evidence_files.id"))
    clock_offset_basis: Mapped[str | None] = mapped_column(String(40))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (
        CheckConstraint("camera_role IS NULL OR camera_role IN ('cctv','dashcam','other')", name="ck_src_camera_role"),
        CheckConstraint("clock_offset_basis IS NULL OR clock_offset_basis = 'declared_by_investigator'", name="ck_src_offset_basis"),
        CheckConstraint(
            "(clock_offset_ms IS NULL AND clock_offset_reference_id IS NULL) OR (clock_offset_ms IS NOT NULL AND clock_offset_reference_id IS NOT NULL)",
            name="ck_src_offset_pair",
        ),
        CheckConstraint("clock_offset_reference_id IS NULL OR clock_offset_reference_id <> evidence_id", name="ck_src_offset_distinct"),
    )


class VehicleAssociation(Base):
    """A possible link between tracks on different cameras. Status stays uncertain. Track ids are not matched."""

    __tablename__ = "vehicle_associations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("vas"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    scenario_id: Mapped[str] = mapped_column(ForeignKey("reconstruction_scenarios.id"))
    status: Mapped[str] = mapped_column(String(12), default="uncertain")
    tracks: Mapped[list] = mapped_column(JSONB)
    supporting: Mapped[list] = mapped_column(JSONB)
    contradicting: Mapped[list] = mapped_column(JSONB)
    basis: Mapped[str] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        CheckConstraint("status = 'uncertain'", name="ck_vas_status"),
        Index("ix_vas_scenario", "case_id", "scenario_id"),
    )


class Actor(Base):
    __tablename__ = "actors"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("act"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    label: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(12))
    attributes: Mapped[dict | None] = mapped_column(JSONB)
    __table_args__ = (CheckConstraint("kind IN ('vehicle','pedestrian','cyclist','other')", name="ck_actor_kind"),)


class ActorLink(Base):
    """Identity decisions. Uncertain matches stay 'candidate'; only confirmed links are used by contradiction rules."""

    __tablename__ = "actor_links"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("lnk"))
    actor_id: Mapped[str] = mapped_column(ForeignKey("actors.id"))
    ref_type: Mapped[str] = mapped_column(String(14))
    ref_id: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(10), default="candidate")
    basis: Mapped[dict | None] = mapped_column(JSONB)
    decided_by: Mapped[str | None] = mapped_column(String(64))  # an actor name from the X-Actor header (no user accounts)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("ref_type IN ('track','sensor_source','claim')", name="ck_link_ref"),
        CheckConstraint("status IN ('candidate','confirmed','rejected')", name="ck_link_status"),
    )


class SyncGroup(Base):
    __tablename__ = "sync_groups"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("sg"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    reference_source: Mapped[str] = mapped_column(String(64))
    members: Mapped[list] = mapped_column(JSONB)
    basis: Mapped[dict] = mapped_column(JSONB)
    version: Mapped[int] = mapped_column(Integer, default=1)


class ReconstructionScenario(Base):
    __tablename__ = "reconstruction_scenarios"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("scn"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    name: Mapped[str] = mapped_column(String(160))
    is_baseline: Mapped[bool] = mapped_column(Boolean, default=False)
    assumptions: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_by: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Event(Base):
    """Canonical event (EVENT_SCHEMA v3). Append-only in practice: corrections create a new version via `supersedes`."""

    __tablename__ = "events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("evt"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    scenario_id: Mapped[str | None] = mapped_column(ForeignKey("reconstruction_scenarios.id"))
    schema_version: Mapped[str] = mapped_column(String(8), default="3.0")
    category: Mapped[str] = mapped_column(String(20))
    event_type: Mapped[str] = mapped_column(String(60))
    title: Mapped[str] = mapped_column(String(240))
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("actors.id"))
    actor_candidates: Mapped[list | None] = mapped_column(JSONB)
    start_case_ms: Mapped[int | None] = mapped_column(BigInteger)
    end_case_ms: Mapped[int | None] = mapped_column(BigInteger)
    start_utc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_utc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    uncertainty_ms: Mapped[int] = mapped_column(Integer, default=0)
    uncertainty_basis: Mapped[str] = mapped_column(String(40))
    sync_group_id: Mapped[str | None] = mapped_column(ForeignKey("sync_groups.id"))
    source_type: Mapped[str] = mapped_column(String(20))
    source_id: Mapped[str | None] = mapped_column(ForeignKey("evidence_files.id"))
    location: Mapped[dict | None] = mapped_column(JSONB)
    observations: Mapped[dict | None] = mapped_column(JSONB)
    inference: Mapped[dict | None] = mapped_column(JSONB)
    confidence: Mapped[dict] = mapped_column(JSONB)
    provenance: Mapped[dict] = mapped_column(JSONB)
    synthetic: Mapped[bool] = mapped_column(Boolean)
    review_status: Mapped[str] = mapped_column(String(12), default="unreviewed")
    version: Mapped[int] = mapped_column(Integer, default=1)
    supersedes: Mapped[str | None] = mapped_column(ForeignKey("events.id"))
    __table_args__ = (
        CheckConstraint(
            "category IN ('direct_observation','machine_detection','witness_claim','inference')", name="ck_event_category"
        ),
        CheckConstraint(
            "source_type IN ('video_dashcam','video_cctv','witness','sensor','vlm','engine','investigator')", name="ck_event_source_type"
        ),
        CheckConstraint("review_status IN ('unreviewed','reviewed','disputed')", name="ck_event_review"),
        # an inference must carry an inference detail, and only inferences may
        CheckConstraint("(category = 'inference') = (inference IS NOT NULL)", name="ck_event_inference_detail"),
        # inference premises and alternatives must be non-empty arrays (NULL never passes)
        CheckConstraint(
            "CASE WHEN category = 'inference' THEN COALESCE("
            "jsonb_typeof(inference->'premises') = 'array' AND jsonb_typeof(inference->'alternatives') = 'array' "
            "AND jsonb_array_length(inference->'premises') >= 1 AND jsonb_array_length(inference->'alternatives') >= 1, false) "
            "ELSE true END",
            name="ck_event_inference_complete",
        ),
        CheckConstraint("(category = 'inference') = (source_type = 'engine')", name="ck_event_engine_inference"),
        CheckConstraint("end_case_ms IS NULL OR start_case_ms IS NULL OR end_case_ms >= start_case_ms", name="ck_event_time_order"),
        CheckConstraint("uncertainty_ms >= 0", name="ck_event_uncertainty"),
        Index("ix_events_case_time", "case_id", "scenario_id", "start_case_ms"),
        Index("ix_events_case_type", "case_id", "event_type"),
    )


class EventSource(Base):
    """Resolved source references for non-inference events (frames, sensor rows, statement spans)."""

    __tablename__ = "event_sources"
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), primary_key=True)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence_files.id"), primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), primary_key=True)
    frames = mapped_column(INT4RANGE)
    rows = mapped_column(INT4RANGE)
    char_span = mapped_column(INT4RANGE)
    thumbnail_path: Mapped[str | None] = mapped_column(String(300))
    __table_args__ = (
        CheckConstraint(
            "kind IN ('video_frames','sensor_rows','statement_span','document_region','metadata')", name="ck_evsrc_kind"
        ),
        Index("ix_evsrc_evidence", "evidence_id"),
    )


class Contradiction(Base):
    __tablename__ = "contradictions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("con"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    scenario_id: Mapped[str | None] = mapped_column(ForeignKey("reconstruction_scenarios.id"))
    rule_id: Mapped[str] = mapped_column(String(40))
    event_a: Mapped[str] = mapped_column(ForeignKey("events.id"))
    event_b: Mapped[str] = mapped_column(ForeignKey("events.id"))
    related_events: Mapped[list | None] = mapped_column(JSONB)
    strength: Mapped[str] = mapped_column(String(10))
    basis: Mapped[dict] = mapped_column(JSONB)
    explanation_template: Mapped[str] = mapped_column(Text)
    explanation_llm: Mapped[str | None] = mapped_column(Text)
    unresolved_questions: Mapped[list | None] = mapped_column(JSONB)
    review_status: Mapped[str] = mapped_column(String(12), default="unreviewed")
    __table_args__ = (
        CheckConstraint("strength IN ('clear','marginal')", name="ck_con_strength"),
        CheckConstraint("event_a <> event_b", name="ck_con_distinct"),
        Index("ix_con_case", "case_id", "scenario_id"),
    )


class Corroboration(Base):
    __tablename__ = "corroborations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("crb"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    scenario_id: Mapped[str | None] = mapped_column(ForeignKey("reconstruction_scenarios.id"))
    rule_id: Mapped[str] = mapped_column(String(40))
    events: Mapped[list] = mapped_column(JSONB)
    independent: Mapped[bool] = mapped_column(Boolean)
    independence_reason: Mapped[str] = mapped_column(Text)
    temporal_relation: Mapped[str | None] = mapped_column(String(60))
    explanation_template: Mapped[str] = mapped_column(Text)
    review_status: Mapped[str] = mapped_column(String(12), default="unreviewed")
    __table_args__ = (Index("ix_crb_case", "case_id", "scenario_id"),)


class Trajectory(Base):
    __tablename__ = "trajectories"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("trj"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    scenario_id: Mapped[str | None] = mapped_column(ForeignKey("reconstruction_scenarios.id"))
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("actors.id"))
    track_ref: Mapped[dict | None] = mapped_column(JSONB)
    frame: Mapped[str] = mapped_column(String(12))
    camera_id: Mapped[str | None] = mapped_column(ForeignKey("cameras.id"))
    points: Mapped[list] = mapped_column(JSONB)
    calibration_note: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (
        CheckConstraint("frame IN ('image','ground_plane','wgs84','schematic')", name="ck_trj_frame"),
        # metric frames require a camera/calibration context; image frames require the camera they belong to
        CheckConstraint("frame <> 'image' OR camera_id IS NOT NULL", name="ck_trj_image_camera"),
    )


class EventSummary(Base):
    """Incident summary generated once at analysis time and read at playback time."""

    __tablename__ = "event_summaries"
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), primary_key=True)
    scenario_id: Mapped[str] = mapped_column(ForeignKey("reconstruction_scenarios.id"), primary_key=True)
    content: Mapped[dict] = mapped_column(JSONB)
    validated: Mapped[bool] = mapped_column(Boolean, default=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class InvestigationFinding(Base):
    __tablename__ = "investigation_findings"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("fnd"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    scenario_id: Mapped[str | None] = mapped_column(ForeignKey("reconstruction_scenarios.id"))
    kind: Mapped[str] = mapped_column(String(16))
    ref_ids: Mapped[list] = mapped_column(JSONB)
    text: Mapped[str | None] = mapped_column(Text)
    review_status: Mapped[str] = mapped_column(String(12), default="unreviewed")
    reviewer: Mapped[str | None] = mapped_column(String(64))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint(
            "kind IN ('timeline','contradiction','corroboration','gap','observation','inference','open_question')", name="ck_fnd_kind"
        ),
        # every finding must reference something real
        CheckConstraint("jsonb_typeof(ref_ids) = 'array' AND jsonb_array_length(ref_ids) >= 1", name="ck_fnd_has_refs"),
    )


class Annotation(Base):
    __tablename__ = "annotations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("ann"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    target_type: Mapped[str] = mapped_column(String(30))
    target_id: Mapped[str] = mapped_column(String(64))
    author: Mapped[str | None] = mapped_column(String(64))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("rpt"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    scenario_id: Mapped[str | None] = mapped_column(ForeignKey("reconstruction_scenarios.id"))
    version: Mapped[int] = mapped_column(Integer, default=1)
    content: Mapped[dict] = mapped_column(JSONB)
    pdf_path: Mapped[str | None] = mapped_column(String(300))
    validation: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
