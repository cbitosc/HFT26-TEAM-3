"""Processing jobs, LLM call ledger, and the hash-chained audit log."""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, new_id

JOB_STATES = ("pending", "validating", "processing", "completed", "failed", "partially_completed")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id("job"))
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"))
    evidence_id: Mapped[str | None] = mapped_column(ForeignKey("evidence_files.id"))
    stage: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[dict | None] = mapped_column(JSONB)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    input_hash: Mapped[str | None] = mapped_column(String(64))
    params_hash: Mapped[str | None] = mapped_column(String(64))
    params: Mapped[dict | None] = mapped_column(JSONB)  # stage parameters (e.g. sample_fps); hashed into params_hash
    result: Mapped[dict | None] = mapped_column(JSONB)  # summary of what the stage produced, warnings, reused runs
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("status IN " + str(JOB_STATES), name="ck_job_status"),
        CheckConstraint("progress >= 0 AND progress <= 1", name="ck_job_progress"),
        Index("ix_jobs_case_status", "case_id", "status"),
    )


class LlmCall(Base):
    """Ledger of every outbound model call (also the replay cache). Stores hashes and the validated response, never the key."""

    __tablename__ = "llm_calls"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    model_run_id: Mapped[str | None] = mapped_column(ForeignKey("model_runs.id"))
    provider: Mapped[str] = mapped_column(String(30), default="featherless")
    model: Mapped[str] = mapped_column(String(160))
    prompt_hash: Mapped[str] = mapped_column(String(64))
    input_hash: Mapped[str] = mapped_column(String(64))
    request_meta: Mapped[dict | None] = mapped_column(JSONB)
    response: Mapped[dict | None] = mapped_column(JSONB)
    valid: Mapped[bool | None] = mapped_column(Boolean)
    tokens_in: Mapped[int | None] = mapped_column(Integer)
    tokens_out: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (Index("ix_llm_hash", "prompt_hash", "input_hash"),)


class AuditLog(Base):
    """Append-only (trigger in migration 0002). entry_hash = sha256(prev_hash || canonical entry), set by the application."""

    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    case_id: Mapped[str | None] = mapped_column(ForeignKey("cases.id"))
    actor: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(60))
    target_type: Mapped[str | None] = mapped_column(String(30))
    target_id: Mapped[str | None] = mapped_column(String(64))
    details: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    prev_hash: Mapped[str | None] = mapped_column(String(64))
    entry_hash: Mapped[str] = mapped_column(String(64))
