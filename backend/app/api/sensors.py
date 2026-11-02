from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.api.deps import get_actor, get_case, get_evidence
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import AppError
from app.models import Actor, ActorLink, Case, EvidenceFile, ModelRun, SensorRecord, SensorSource, SourceEvent
from app.services import audit, sensors
from app.services.jobs import params_hash
from app.storage import safe_resolve

router = APIRouter(tags=["sensors"])


class SensorSpec(BaseModel):
    mapping: dict[str, str] = Field(description="canonical field -> CSV column, e.g. {'t': 'timestamp', 'speed': 'speed_kmh'}")
    units: dict[str, str] = Field(description="units per mapped field; never guessed")
    clock: Literal["relative", "simulation", "utc", "local"] = "relative"
    timezone: str | None = None
    sign: dict[str, int] = Field(default_factory=dict, description="-1 to flip an axis (e.g. phone mounted backwards)")
    thresholds: dict[str, float] = Field(default_factory=dict)
    actor_id: str | None = None


class SensorRegister(SensorSpec):
    evidence_id: str


def _load(ev: EvidenceFile, settings: Settings) -> bytes:
    if ev.kind != "sensor_csv":
        raise AppError(400, "NOT_A_SENSOR_FILE", "Sensor processing applies to sensor_csv evidence")
    if ev.status != "valid":
        raise AppError(409, "EVIDENCE_NOT_VALID", f"Evidence status is '{ev.status}'")
    return safe_resolve(settings.storage_path, ev.stored_path).read_bytes()


def _analyze(raw: bytes, spec: SensorSpec) -> dict:
    try:
        return sensors.analyze(raw, spec.mapping, spec.units, spec.clock, spec.timezone, spec.sign, spec.thresholds)
    except (sensors.MappingError, KeyError) as exc:
        raise AppError(422, "MAPPING_INVALID", str(exc))


def _summary(a: dict) -> dict:
    return {"rows": a["rows"], "valid_rows": a["valid_rows"], "sampling": a["sampling"], "issue_counts": a["issue_counts"],
            "gps_consistency": a["gps_consistency"], "thresholds": a["thresholds"],
            "events": [{k: e[k] for k in ("event_type", "rule_id", "t_start_ms", "t_end_ms", "source_ref", "observations")} for e in a["events"]]}


@router.post("/evidence/{evidence_id}/sensor-preview")
def preview(spec: SensorSpec, ev: EvidenceFile = Depends(get_evidence), settings: Settings = Depends(get_settings)) -> dict:
    """Dry run: parse with this mapping and show what would be stored. Nothing is written."""
    a = _analyze(_load(ev, settings), spec)
    return _summary(a) | {"first_rows": [{k: r[k] for k in ("row_no", "t_raw", "time_ms", "si", "issues")} for r in a["records"][:10]]}


@router.post("/cases/{case_id}/sensors", status_code=201)
def register(body: SensorRegister, case: Case = Depends(get_case), db: Session = Depends(get_db), settings: Settings = Depends(get_settings),
             actor: str = Depends(get_actor)) -> dict:
    ev = db.get(EvidenceFile, body.evidence_id)
    if ev is None or ev.case_id != case.id:
        raise AppError(404, "EVIDENCE_NOT_FOUND", "No such evidence in this case")
    if db.execute(select(SensorSource).where(SensorSource.evidence_id == ev.id)).scalars().first():
        raise AppError(409, "ALREADY_REGISTERED", "This sensor file already has a mapping; use sensor-preview to test a new one and upload the file again")
    if body.actor_id and (db.get(Actor, body.actor_id) is None or db.get(Actor, body.actor_id).case_id != case.id):
        raise AppError(404, "ACTOR_NOT_FOUND", "No such actor in this case")
    a = _analyze(_load(ev, settings), body)

    src = SensorSource(case_id=case.id, evidence_id=ev.id, actor_id=body.actor_id,
                       mapping={"columns": body.mapping, "sign": body.sign, "delimiter": a["delimiter"], "meta": a["meta"], "thresholds": a["thresholds"]},
                       units=body.units, clock=body.clock, timezone=body.timezone, sample_rate_hz=a["sampling"]["rate_hz"], synthetic=ev.synthetic)
    db.add(src)
    db.flush()
    if body.actor_id:  # declared mounting is a deterministic identity link (the investigator states which vehicle carried the sensor)
        db.add(ActorLink(actor_id=body.actor_id, ref_type="sensor_source", ref_id=src.id, status="confirmed",
                         basis={"method": "declared mounting at registration"}, decided_by=actor, decided_at=datetime.now(timezone.utc)))
    run = ModelRun(case_id=case.id, stage="sensor_rules", model_id="rules:sensors", model_version=sensors.SENSOR_VERSION,
                   params={"mapping": body.mapping, "units": body.units, "thresholds": a["thresholds"], "sign": body.sign},
                   params_hash=params_hash({"m": body.mapping, "u": body.units, "t": a["thresholds"]}), input_sha256=ev.sha256, device="cpu",
                   started_at=datetime.now(timezone.utc), finished_at=datetime.now(timezone.utc), status="completed",
                   metrics={"rows": a["rows"], "valid_rows": a["valid_rows"], "events": len(a["events"]), "issues": a["issue_counts"]})
    db.add(run)
    db.flush()
    rows = [{"sensor_source_id": src.id, "row_no": r["row_no"], "t_raw": r["t_raw"][:80], "time_ms": round(r["time_ms"]) if r["time_ms"] is not None else None,
             "values": {"raw": r["raw"], "si": r["si"]}, "valid": r["valid"], "issues": r["issues"] or None} for r in a["records"]]
    for i in range(0, len(rows), 3000):
        db.execute(insert(SensorRecord), rows[i:i + 3000])
    quality = "low" if a["issue_counts"] or a["sampling"]["gaps"] else "high"
    for e in a["events"]:
        db.add(SourceEvent(case_id=case.id, evidence_id=ev.id, stage="sensors", category=e["category"], event_type=e["event_type"], t_start_ms=e["t_start_ms"],
                           t_end_ms=e["t_end_ms"], uncertainty_ms=e["uncertainty_ms"], source_ref=e["source_ref"] | {"evidence_id": ev.id},
                           observations=e["observations"], confidence={"source_quality": quality, "timestamp": "unsynchronized"},
                           entity_hint={"actor_id": body.actor_id, "sensor_source": src.id}, rule_id=e["rule_id"], model_run_id=run.id))
    audit.record(db, actor=actor, action="sensor_registered", case_id=case.id, target_type="sensor_source", target_id=src.id,
                 details={"evidence_id": ev.id, "rows": a["rows"], "events": len(a["events"]), "synthetic": ev.synthetic})
    db.commit()
    return {"sensor_source_id": src.id, "model_run_id": run.id, "synthetic": ev.synthetic, "clock": body.clock,
            "note": "Sensor time is the sensor's own clock (ms from its first valid sample). It is not synchronized with any camera until a clock relation is recorded."} | _summary(a)


@router.get("/cases/{case_id}/sensors")
def list_sources(case: Case = Depends(get_case), db: Session = Depends(get_db)) -> dict:
    out = []
    for s in db.execute(select(SensorSource).where(SensorSource.case_id == case.id)).scalars():
        out.append({"id": s.id, "evidence_id": s.evidence_id, "actor_id": s.actor_id, "clock": s.clock, "units": s.units, "mapping": s.mapping["columns"],
                    "sample_rate_hz": s.sample_rate_hz, "synthetic": s.synthetic})
    return {"items": out}


def _source(db: Session, ev: EvidenceFile) -> SensorSource:
    s = db.execute(select(SensorSource).where(SensorSource.evidence_id == ev.id)).scalars().first()
    if s is None:
        raise AppError(409, "SENSOR_NOT_REGISTERED", "This sensor file has no mapping yet", {"register": f"/api/v1/cases/{ev.case_id}/sensors"})
    return s


@router.get("/evidence/{evidence_id}/sensor-records")
def records(from_ms: int = Query(0, ge=0), to_ms: int | None = Query(None, ge=0), fields: str | None = None, limit: int = Query(2000, ge=1, le=20000),
            include_raw: bool = False, ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db)) -> dict:
    s = _source(db, ev)
    q = select(SensorRecord).where(SensorRecord.sensor_source_id == s.id, SensorRecord.time_ms >= from_ms).order_by(SensorRecord.row_no).limit(limit)
    if to_ms is not None:
        q = q.where(SensorRecord.time_ms <= to_ms)
    want = {f.strip() for f in fields.split(",")} if fields else None
    items = []
    for r in db.execute(q).scalars():
        si = {k: v for k, v in r.values["si"].items() if not want or k in want}
        items.append({"row_no": r.row_no, "time_ms": r.time_ms, "si": si, "valid": r.valid, "issues": r.issues} | ({"raw": r.values["raw"]} if include_raw else {}))
    return {"evidence_id": ev.id, "sensor_source_id": s.id, "units_si": {"speed": "m/s", "accel": "m/s2", "gyro_z": "rad/s", "heading": "deg"},
            "time_basis": "sensor source time (ms from first valid sample); not synchronized", "items": items}


@router.get("/evidence/{evidence_id}/sensor-events")
def sensor_events(ev: EvidenceFile = Depends(get_evidence), db: Session = Depends(get_db)) -> dict:
    _source(db, ev)
    rows = db.execute(select(SourceEvent).where(SourceEvent.evidence_id == ev.id, SourceEvent.stage == "sensors").order_by(SourceEvent.t_start_ms)).scalars()
    return {"items": [{"id": e.id, "event_type": e.event_type, "rule_id": e.rule_id, "t_start_ms": e.t_start_ms, "t_end_ms": e.t_end_ms,
                       "source_ref": e.source_ref, "observations": e.observations, "category": e.category} for e in rows]}
