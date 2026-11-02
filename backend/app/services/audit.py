"""Append-only, hash-chained audit log. entry_hash = sha256(prev_hash || canonical entry)."""
import hashlib
import json
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import AuditLog

_LOCK_KEY = 727001


def _fmt(ts: datetime) -> str:
    return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")


def _digest(prev: str | None, row: dict) -> str:
    canonical = json.dumps(row, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(((prev or "") + canonical).encode()).hexdigest()


def _row(case_id, actor, action, target_type, target_id, details, ts: datetime) -> dict:
    return {"case_id": case_id, "actor": actor, "action": action, "target_type": target_type,
            "target_id": target_id, "details": details or {}, "at": _fmt(ts)}


def record(session: Session, *, actor: str, action: str, case_id: str | None = None, target_type: str | None = None,
           target_id: str | None = None, details: dict | None = None) -> AuditLog:
    """Add an audit entry inside the caller's transaction. Keep `details` to strings, ints and bools so it hashes stably."""
    session.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _LOCK_KEY})  # serialize the chain
    prev = session.execute(select(AuditLog.entry_hash).order_by(AuditLog.id.desc()).limit(1)).scalar()
    ts = datetime.now(timezone.utc)
    entry = AuditLog(case_id=case_id, actor=actor, action=action, target_type=target_type, target_id=target_id,
                     details=details or {}, created_at=ts, prev_hash=prev,
                     entry_hash=_digest(prev, _row(case_id, actor, action, target_type, target_id, details, ts)))
    session.add(entry)
    session.flush()
    return entry


def verify_chain(session: Session) -> tuple[bool, int | None]:
    """Recompute every hash. Returns (ok, id of the first broken entry)."""
    prev = None
    for e in session.execute(select(AuditLog).order_by(AuditLog.id)).scalars():
        expected = _digest(prev, _row(e.case_id, e.actor, e.action, e.target_type, e.target_id, e.details, e.created_at))
        if e.prev_hash != prev or e.entry_hash != expected:
            return False, e.id
        prev = e.entry_hash
    return True, None
