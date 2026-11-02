"""Candidate events in source time, clock records and synchronization edges, and gap records.

Extractors (video rules, sensor rules, witness claims) write SourceEvent rows in their own source time. The reconstruction
engine turns them into canonical, append-only Events on case time once clock relations are known, per scenario.
"""
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, new_id


class SourceEvent(Base):
    __tablename__ = "source_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("se"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence_files.id"))
    stage: Mapped[str] = mapped_column(String(20))
    category: Mapped[str] = mapped_column(String(20))
    event_type: Mapped[str] = mapped_column(String(60))
    t_start_ms: Mapped[float | None] = mapped_column(Float)  # source time (media time / sensor time); NULL = not placed
    t_end_ms: Mapped[float | None] = mapped_column(Float)
    uncertainty_ms: Mapped[float] = mapped_column(Float, default=0.0)  # intrinsic to the source (frame period, sample period)
    source_ref: Mapped[dict] = mapped_column(JSONB)
    observations: Mapped[dict] = mapped_column(JSONB, default=dict)
    confidence: Mapped[dict] = mapped_column(JSONB, default=dict)
    entity_hint: Mapped[dict | None] = mapped_column(JSONB)
    rule_id: Mapped[str] = mapped_column(String(40))
    model_run_id: Mapped[str | None] = mapped_column(ForeignKey("model_runs.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        CheckConstraint("stage IN ('video_events','sensors','witness')", name="ck_se_stage"),
        CheckConstraint("category IN ('direct_observation','machine_detection','witness_claim')", name="ck_se_category"),
        Index("ix_se_case_evidence", "case_id", "evidence_id"),
        Index("ix_se_case_type", "case_id", "event_type"),
    )


class ClockRecord(Base):
    """What is known about one source's clock. `utc_zero` is the UTC instant of source time 0 and is used for synchronization
    only when the basis is trusted (declared by the investigator or a simulation clock); embedded metadata is never trusted."""

    __tablename__ = "clock_records"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("clk"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence_files.id"), unique=True)
    utc_zero: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    bound_ms: Mapped[float] = mapped_column(Float, default=0.0)
    basis: Mapped[str] = mapped_column(String(30))
    timezone: Mapped[str | None] = mapped_column(String(64))
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (CheckConstraint("basis IN ('declared_by_investigator','simulation_clock','embedded_metadata_unverified')", name="ck_clk_basis"),
                      CheckConstraint("bound_ms >= 0", name="ck_clk_bound"))


class SyncEdge(Base):
    """A stated relation between two source clocks: t_b = t_a + offset_ms (± bound_ms)."""

    __tablename__ = "sync_edges"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("sed"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    a_evidence: Mapped[str] = mapped_column(ForeignKey("evidence_files.id"))
    b_evidence: Mapped[str] = mapped_column(ForeignKey("evidence_files.id"))
    offset_ms: Mapped[float] = mapped_column(Float)
    bound_ms: Mapped[float] = mapped_column(Float)
    basis: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(10), default="declared")
    note: Mapped[str | None] = mapped_column(Text)
    evidence_refs: Mapped[dict | None] = mapped_column(JSONB)
    created_by: Mapped[str] = mapped_column(String(64))
    decided_by: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        CheckConstraint("basis IN ('simulation_clock','known_offset','manual_sync_point','frame_correspondence','anchor_proposal')", name="ck_sed_basis"),
        CheckConstraint("status IN ('declared','verified','proposed','rejected')", name="ck_sed_status"),
        CheckConstraint("a_evidence <> b_evidence", name="ck_sed_distinct"),
        CheckConstraint("bound_ms >= 0", name="ck_sed_bound"),
        Index("ix_sed_case", "case_id"),
    )


class GapRecord(Base):
    __tablename__ = "gap_records"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("gap"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    scenario_id: Mapped[str] = mapped_column(ForeignKey("reconstruction_scenarios.id"))
    gap_type: Mapped[str] = mapped_column(String(40))
    scope: Mapped[dict] = mapped_column(JSONB)
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    recommendation: Mapped[str] = mapped_column(Text)
    refs: Mapped[list] = mapped_column(JSONB)
    __table_args__ = (CheckConstraint("jsonb_typeof(refs) = 'array' AND jsonb_array_length(refs) >= 1", name="ck_gap_refs"),
                      Index("ix_gap_case", "case_id", "scenario_id"))
