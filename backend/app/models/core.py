"""Users, cases, evidence files (immutable originals), cameras, video metadata, extracted frames."""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, new_id


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("usr"))
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20), default="investigator")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (CheckConstraint("role IN ('investigator','reviewer','admin')", name="ck_users_role"),)


class Case(Base):
    __tablename__ = "cases"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("case"))
    code: Mapped[str] = mapped_column(String(40), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open")
    designation: Mapped[str] = mapped_column(String(20))
    allow_external_inference: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    incident_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    location_text: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (
        CheckConstraint("status IN ('open','processing','review','closed')", name="ck_cases_status"),
        CheckConstraint("designation IN ('real','staged','synthetic','mixed')", name="ck_cases_designation"),
    )


class EvidenceFile(Base):
    """Original evidence. Immutable columns are protected by a database trigger (see migration 0002)."""

    __tablename__ = "evidence_files"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("ev"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    kind: Mapped[str] = mapped_column(String(20))
    original_filename: Mapped[str] = mapped_column(String(255))  # display only; never used as a path
    stored_path: Mapped[str] = mapped_column(String(300))  # server-generated, content-addressed; shared by identical content
    mime_type: Mapped[str | None] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(String(64))
    uploaded_by: Mapped[str | None] = mapped_column(String(64))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    synthetic: Mapped[bool] = mapped_column(Boolean)
    provenance: Mapped[dict | None] = mapped_column(JSONB)
    licence: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(12), default="uploaded")
    validation: Mapped[dict | None] = mapped_column(JSONB)
    __table_args__ = (
        UniqueConstraint("case_id", "sha256", name="uq_evidence_case_sha"),
        CheckConstraint(
            "kind IN ('dashcam','cctv','witness_text','witness_pdf','sensor_csv','annotation','ground_truth')", name="ck_evidence_kind"
        ),
        CheckConstraint("status IN ('uploaded','valid','invalid')", name="ck_evidence_status"),
        CheckConstraint("length(sha256) = 64", name="ck_evidence_sha_len"),
        Index("ix_evidence_case", "case_id"),
        Index("ix_evidence_stored_path", "stored_path"),
    )


class Camera(Base):
    __tablename__ = "cameras"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("cam"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    kind: Mapped[str] = mapped_column(String(10))
    label: Mapped[str] = mapped_column(String(120))
    mounted_actor_id: Mapped[str | None] = mapped_column(ForeignKey("actors.id"))
    calibration: Mapped[dict | None] = mapped_column(JSONB)
    calibration_error_px: Mapped[float | None] = mapped_column(Float)
    __table_args__ = (CheckConstraint("kind IN ('dashcam','cctv')", name="ck_cameras_kind"),)


class VideoMetadata(Base):
    __tablename__ = "video_metadata"
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence_files.id"), primary_key=True)
    duration_ms: Mapped[int | None] = mapped_column(BigInteger)
    pts_start_ms: Mapped[float | None] = mapped_column(Float)  # container PTS of the first frame; frame times are relative to it
    fps_nominal: Mapped[float | None] = mapped_column(Float)
    fps_measured: Mapped[float | None] = mapped_column(Float)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    codec: Mapped[str | None] = mapped_column(String(40))
    rotation: Mapped[int | None] = mapped_column(Integer)
    frame_count: Mapped[int | None] = mapped_column(Integer)
    creation_time_claimed: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    timezone: Mapped[str | None] = mapped_column(String(64))
    clock_offset_ms: Mapped[int | None] = mapped_column(Integer)
    clock_offset_basis: Mapped[str | None] = mapped_column(String(60))
    camera_id: Mapped[str | None] = mapped_column(ForeignKey("cameras.id"))
    playback_path: Mapped[str | None] = mapped_column(String(300))  # derived H.264 copy, never the original


class ExtractedFrame(Base):
    __tablename__ = "extracted_frames"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence_files.id"))
    frame_no: Mapped[int] = mapped_column(Integer)
    time_ms: Mapped[int] = mapped_column(BigInteger)  # media time from the first frame, from container PTS
    thumbnail_path: Mapped[str | None] = mapped_column(String(300))
    blur: Mapped[float | None] = mapped_column(Float)
    brightness: Mapped[float | None] = mapped_column(Float)
    sampled: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (
        UniqueConstraint("evidence_id", "frame_no", name="uq_frame_evidence_no"),
        Index("ix_frames_evidence_time", "evidence_id", "time_ms"),
    )
