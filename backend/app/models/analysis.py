"""Model runs, vision outputs, witnesses and claims, sensors."""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, new_id


class ModelRun(Base):
    __tablename__ = "model_runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("run"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    stage: Mapped[str] = mapped_column(String(40))
    model_id: Mapped[str] = mapped_column(String(160))
    model_version: Mapped[str | None] = mapped_column(String(80))
    params: Mapped[dict] = mapped_column(JSONB, default=dict)
    params_hash: Mapped[str] = mapped_column(String(64))
    input_sha256: Mapped[str | None] = mapped_column(String(64))
    device: Mapped[str | None] = mapped_column(String(20))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="running")
    metrics: Mapped[dict | None] = mapped_column(JSONB)


class Detection(Base):
    __tablename__ = "detections"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    frame_id: Mapped[int] = mapped_column(ForeignKey("extracted_frames.id"))
    model_run_id: Mapped[str] = mapped_column(ForeignKey("model_runs.id"))
    class_name: Mapped[str] = mapped_column("class", String(40))
    confidence: Mapped[float] = mapped_column(Float)
    x1: Mapped[float] = mapped_column(Float)
    y1: Mapped[float] = mapped_column(Float)
    x2: Mapped[float] = mapped_column(Float)
    y2: Mapped[float] = mapped_column(Float)
    track_id: Mapped[int | None] = mapped_column(Integer)
    is_accident_cue: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    __table_args__ = (
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_det_conf"),
        Index("ix_det_frame", "frame_id"),
        Index("ix_det_track", "track_id"),
    )


class VehicleTrack(Base):
    __tablename__ = "vehicle_tracks"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("trk"))
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence_files.id"))
    model_run_id: Mapped[str] = mapped_column(ForeignKey("model_runs.id"))
    track_id: Mapped[int] = mapped_column(Integer)  # unique per video and run only; never across cameras
    class_name: Mapped[str] = mapped_column("class", String(40))
    first_frame: Mapped[int] = mapped_column(Integer)
    last_frame: Mapped[int] = mapped_column(Integer)
    duration_ms: Mapped[int] = mapped_column(BigInteger)
    mean_confidence: Mapped[float] = mapped_column(Float)
    continuity: Mapped[dict] = mapped_column(JSONB, default=dict)  # gaps, fragments, suspected identity switches
    points: Mapped[list] = mapped_column(JSONB, default=list)
    __table_args__ = (
        UniqueConstraint("evidence_id", "model_run_id", "track_id", name="uq_track_run"),
        Index("ix_tracks_evidence", "evidence_id"),
    )


class Witness(Base):
    __tablename__ = "witnesses"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("wit"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    label: Mapped[str] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)


class WitnessStatement(Base):
    """The original statement text is immutable (trigger in migration 0002)."""

    __tablename__ = "witness_statements"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("stm"))
    witness_id: Mapped[str] = mapped_column(ForeignKey("witnesses.id"))
    evidence_id: Mapped[str | None] = mapped_column(ForeignKey("evidence_files.id"))
    text_original: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(10))
    statement_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synthetic: Mapped[bool] = mapped_column(Boolean)
    __table_args__ = (CheckConstraint("source IN ('typed','txt','pdf','ocr')", name="ck_stm_source"),)


class WitnessClaim(Base):
    """char_start/char_end index text_original; source_text must equal that substring (trigger)."""

    __tablename__ = "witness_claims"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("clm"))
    statement_id: Mapped[str] = mapped_column(ForeignKey("witness_statements.id"))
    model_run_id: Mapped[str | None] = mapped_column(ForeignKey("model_runs.id"))
    char_start: Mapped[int] = mapped_column(Integer)
    char_end: Mapped[int] = mapped_column(Integer)
    source_text: Mapped[str] = mapped_column(Text)
    subject: Mapped[str | None] = mapped_column(String(200))
    action: Mapped[str | None] = mapped_column(String(120))
    direction: Mapped[str | None] = mapped_column(String(60))
    time_description: Mapped[str | None] = mapped_column(String(200))
    certainty: Mapped[str | None] = mapped_column(String(60))
    normalized: Mapped[dict | None] = mapped_column(JSONB)
    extraction_status: Mapped[str] = mapped_column(String(10))
    __table_args__ = (
        CheckConstraint("extraction_status IN ('valid','repaired','failed','manual')", name="ck_claim_status"),
        CheckConstraint("char_start >= 0 AND char_end > char_start", name="ck_claim_span"),
        Index("ix_claims_statement", "statement_id"),
    )


class SensorSource(Base):
    __tablename__ = "sensor_sources"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("sns"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence_files.id"))
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("actors.id"))
    mapping: Mapped[dict] = mapped_column(JSONB)
    units: Mapped[dict] = mapped_column(JSONB)
    clock: Mapped[str] = mapped_column(String(12))
    timezone: Mapped[str | None] = mapped_column(String(64))
    clock_offset_ms: Mapped[int | None] = mapped_column(Integer)
    clock_offset_basis: Mapped[str | None] = mapped_column(String(60))
    sample_rate_hz: Mapped[float | None] = mapped_column(Float)
    synthetic: Mapped[bool] = mapped_column(Boolean)
    __table_args__ = (CheckConstraint("clock IN ('utc','local','relative','simulation')", name="ck_sns_clock"),)


class SensorRecord(Base):
    """t_raw keeps the raw timestamp text exactly as uploaded (immutable; trigger in migration 0002)."""

    __tablename__ = "sensor_records"
    sensor_source_id: Mapped[str] = mapped_column(ForeignKey("sensor_sources.id"), primary_key=True)
    row_no: Mapped[int] = mapped_column(Integer, primary_key=True)
    t_raw: Mapped[str] = mapped_column(String(80))
    time_ms: Mapped[int | None] = mapped_column(BigInteger)
    values: Mapped[dict] = mapped_column(JSONB)
    valid: Mapped[bool] = mapped_column(Boolean, default=True)
    issues: Mapped[list | None] = mapped_column(JSONB)
    __table_args__ = (Index("ix_sensor_time", "sensor_source_id", "time_ms"),)
