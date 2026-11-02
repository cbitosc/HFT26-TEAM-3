"""Sensor CSV processing: configurable column mapping, unit conversion, validation, and rule-based candidate events.

Pure functions (no database). Raw cell text is always kept next to converted SI values; derived quantities are computed only
where the inputs are valid, and the method is recorded. Sensor time is source time: milliseconds from the first valid sample.
This module never decides how a sensor clock relates to any camera (that is the synchronization engine's job).
"""
import csv
import io
import math
import statistics
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

SENSOR_VERSION = "1"
G = 9.80665
FIELDS = ("t", "speed", "accel_long", "accel_lat", "accel_vert", "gyro_z", "heading", "lat", "lon", "collision")
SPEED_UNITS = {"m/s": 1.0, "km/h": 1 / 3.6, "mph": 0.44704, "kn": 0.514444}
ACCEL_UNITS = {"m/s2": 1.0, "g": G}
GYRO_UNITS = {"rad/s": 1.0, "deg/s": math.pi / 180}
DEFAULT_THRESHOLDS = {"hard_brake_mps2": -3.0, "hard_brake_min_s": 0.2, "spike_mps2": 12.0, "stop_speed_mps": 0.3, "stop_min_s": 1.0,
                      "moving_speed_mps": 1.0, "heading_change_deg": 30.0, "heading_window_s": 2.0, "gap_factor": 2.5,
                      "decel_window_s": 0.3, "gps_speed_tolerance": 0.3}
RANGES = {"speed": (0, 120), "heading": (-360, 720), "lat": (-90, 90), "lon": (-180, 180)}


class MappingError(ValueError):
    pass


def read_table(raw: bytes) -> tuple[list[str], list[list[str]], str]:
    text = raw.decode("utf-8-sig")
    first = text.splitlines()[0] if text.strip() else ""
    delim = max((",", ";", "\t"), key=first.count)
    rows = list(csv.reader(io.StringIO(text), delimiter=delim))
    if not rows:
        raise MappingError("empty file")
    header = [h.strip() for h in rows[0]]
    body = [r for r in rows[1:] if any(c.strip() for c in r)]
    return header, body, delim


def validate_mapping(header: list[str], mapping: dict, units: dict) -> None:
    unknown = set(mapping) - set(FIELDS)
    if unknown:
        raise MappingError(f"unknown field(s) {sorted(unknown)}; allowed: {list(FIELDS)}")
    if "t" not in mapping:
        raise MappingError("a time column must be mapped as 't'")
    for f, col in mapping.items():
        if col not in header:
            raise MappingError(f"column '{col}' (mapped to '{f}') not found; header is {header}")
    if "t" in mapping and units.get("t") not in ("s", "ms", "iso", "epoch_s", "epoch_ms"):
        raise MappingError("units.t must be one of s, ms, iso, epoch_s, epoch_ms")
    need = {"speed": SPEED_UNITS, "accel_long": ACCEL_UNITS, "accel_lat": ACCEL_UNITS, "accel_vert": ACCEL_UNITS, "gyro_z": GYRO_UNITS}
    for f, table in need.items():
        if f in mapping and units.get(f) not in table:
            raise MappingError(f"units.{f} must be declared, one of {sorted(table)} (undeclared units are not guessed)")
    if "heading" in mapping and units.get("heading", "deg") not in ("deg", "rad"):
        raise MappingError("units.heading must be deg or rad")


def _num(s: str) -> float | None:
    try:
        v = float(s.strip())
        return v if math.isfinite(v) else None
    except (ValueError, AttributeError):
        return None


def _parse_time(raw: str, unit: str, clock: str, tz: str | None) -> float | None:
    """Returns absolute-or-relative milliseconds (epoch ms for absolute units)."""
    raw = raw.strip()
    if unit in ("s", "ms", "epoch_s", "epoch_ms"):
        v = _num(raw)
        if v is None:
            return None
        return v * {"s": 1000, "ms": 1, "epoch_s": 1000, "epoch_ms": 1}[unit]
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo(tz) if clock == "local" and tz else timezone.utc)
    return dt.timestamp() * 1000


def to_si(field: str, value: float, units: dict, sign: dict) -> float:
    v = value * sign.get(field, 1)
    if field == "speed":
        return v * SPEED_UNITS[units["speed"]]
    if field in ("accel_long", "accel_lat", "accel_vert"):
        return v * ACCEL_UNITS[units[field]]
    if field == "gyro_z":
        return v * GYRO_UNITS[units["gyro_z"]]
    if field == "heading":
        return math.degrees(v) % 360 if units.get("heading") == "rad" else v % 360
    return v


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(a))


def parse_records(header: list[str], body: list[list[str]], mapping: dict, units: dict, clock: str, tz: str | None, sign: dict) -> tuple[list[dict], dict]:
    validate_mapping(header, mapping, units)
    idx = {f: header.index(c) for f, c in mapping.items()}
    recs, first_abs = [], None
    prev_t = None
    for n, row in enumerate(body, start=1):
        issues, raw, si = [], {}, {}
        cell = lambda f: row[idx[f]] if idx[f] < len(row) else ""  # noqa: E731
        t_abs = _parse_time(cell("t"), units["t"], clock, tz)
        raw["t"] = cell("t")
        if t_abs is None:
            issues.append("time_unparseable")
        elif first_abs is None:
            first_abs = t_abs
        t_ms = (t_abs - first_abs) if (t_abs is not None and first_abs is not None) else None
        if t_ms is not None:
            if prev_t is not None and t_ms <= prev_t:
                issues.append("time_not_increasing")
            else:
                prev_t = t_ms
        for f in idx:
            if f == "t":
                continue
            raw[f] = cell(f)
            if f == "collision":
                si[f] = cell(f).strip().lower() in ("1", "true", "yes", "y", "t") or (_num(cell(f)) or 0) > 0
                continue
            v = _num(cell(f))
            if v is None:
                issues.append(f"non_numeric:{f}")
                continue
            val = to_si(f, v, units, sign)
            lo, hi = RANGES.get(f, (-math.inf, math.inf))
            if not lo <= val <= hi:
                issues.append(f"out_of_range:{f}")
                continue
            si[f] = val
        recs.append({"row_no": n, "t_raw": raw["t"], "time_ms": t_ms, "raw": raw, "si": si, "issues": issues,
                     "valid": t_ms is not None and "time_not_increasing" not in issues})
    meta = {"first_sample_abs_ms": first_abs if units["t"] in ("iso", "epoch_s", "epoch_ms") else None}
    return recs, meta


def sampling(recs: list[dict], gap_factor: float) -> dict:
    t = [r["time_ms"] for r in recs if r["valid"]]
    if len(t) < 3:
        return {"samples": len(t), "median_dt_ms": None, "rate_hz": None, "gaps": []}
    dts = [b - a for a, b in zip(t, t[1:])]
    med = statistics.median(dts)
    gaps = [{"after_row": a["row_no"], "before_row": b["row_no"], "from_ms": a["time_ms"], "to_ms": b["time_ms"],
             "duration_ms": b["time_ms"] - a["time_ms"]}
            for a, b in zip([r for r in recs if r["valid"]], [r for r in recs if r["valid"]][1:]) if med > 0 and (b["time_ms"] - a["time_ms"]) > gap_factor * med]
    return {"samples": len(t), "median_dt_ms": med, "rate_hz": round(1000 / med, 3) if med > 0 else None, "gaps": gaps}


def _runs(flags: list[bool]):
    start = None
    for i, f in enumerate(flags + [False]):
        if f and start is None:
            start = i
        elif not f and start is not None:
            yield start, i - 1
            start = None


def derived_longitudinal(valid: list[dict], window_s: float) -> list[float | None]:
    """Longitudinal acceleration (m/s2): the sensor's own axis when mapped, else the slope of speed over a short window."""
    out: list[float | None] = []
    for i, r in enumerate(valid):
        if "accel_long" in r["si"]:
            out.append(r["si"]["accel_long"])
            continue
        a = None
        if "speed" in r["si"]:
            for j in range(i + 1, len(valid)):
                if valid[j]["time_ms"] - r["time_ms"] >= window_s * 1000:
                    if "speed" in valid[j]["si"]:
                        a = (valid[j]["si"]["speed"] - r["si"]["speed"]) / ((valid[j]["time_ms"] - r["time_ms"]) / 1000)
                    break
        out.append(a)
    return out


def detect_events(recs: list[dict], mapping: dict, thr: dict, sample_info: dict) -> list[dict]:
    """Rule-based candidate events in sensor source time. Each carries the row range that supports it."""
    valid = [r for r in recs if r["valid"]]
    period = sample_info.get("median_dt_ms") or 0.0
    ev = []

    def add(etype, rule, a, b, obs, category="direct_observation"):
        ev.append({"event_type": etype, "rule_id": rule, "category": category, "t_start_ms": valid[a]["time_ms"], "t_end_ms": valid[b]["time_ms"],
                   "uncertainty_ms": period / 2, "source_ref": {"kind": "sensor_rows", "rows": [valid[a]["row_no"], valid[b]["row_no"]]},
                   "observations": obs})

    if len(valid) < 2:
        return ev
    # hard braking
    accel = derived_longitudinal(valid, thr["decel_window_s"])
    flags = [a is not None and a <= thr["hard_brake_mps2"] for a in accel]
    method = "sensor_axis" if "accel_long" in mapping else "speed_slope"
    for a, b in _runs(flags):
        if (valid[b]["time_ms"] - valid[a]["time_ms"]) / 1000 >= thr["hard_brake_min_s"] or a == b and period / 1000 >= thr["hard_brake_min_s"]:
            seg = [x for x in accel[a:b + 1] if x is not None]
            sp = [valid[k]["si"].get("speed") for k in (a, b)]
            add("hard_braking", "SEN-BRAKE-01", a, b, {"min_accel_mps2": round(min(seg), 3), "method": method,
                                                     "speed_start_mps": sp[0], "speed_end_mps": sp[1], "threshold_mps2": thr["hard_brake_mps2"]})
    # acceleration spike (horizontal magnitude)
    if "accel_long" in mapping or "accel_lat" in mapping:
        mag = [math.hypot(r["si"].get("accel_long", 0.0), r["si"].get("accel_lat", 0.0)) for r in valid]
        for a, b in _runs([m >= thr["spike_mps2"] for m in mag]):
            add("acceleration_spike", "SEN-SPIKE-01", a, b, {"peak_mps2": round(max(mag[a:b + 1]), 3), "threshold_mps2": thr["spike_mps2"],
                                                           "note": "a spike is not by itself a collision"})
    # source-provided collision flag
    if "collision" in mapping:
        prev = False
        for i, r in enumerate(valid):
            cur = bool(r["si"].get("collision"))
            if cur and not prev:
                add("collision_flag", "SEN-COLL-01", i, i, {"source_provided": True})
            prev = cur
    # stops
    if "speed" in mapping:
        was_moving = False
        run_start = None
        for i, r in enumerate(valid + [None]):
            sp = r["si"].get("speed") if r else None
            if sp is not None and sp >= thr["moving_speed_mps"]:
                was_moving = True
            slow = r is not None and sp is not None and sp <= thr["stop_speed_mps"]
            if slow and run_start is None and was_moving:
                run_start = i
            elif not slow and run_start is not None:
                a, b = run_start, i - 1
                if (valid[b]["time_ms"] - valid[a]["time_ms"]) / 1000 >= thr["stop_min_s"] or r is None:
                    add("stop", "SEN-STOP-01", a, b, {"speed_threshold_mps": thr["stop_speed_mps"], "open_ended": r is None})
                run_start = None
                if sp is not None and sp >= thr["moving_speed_mps"]:
                    was_moving = True
    # heading change (heading column, else integrated yaw rate)
    series = None
    if "heading" in mapping:
        series = [(r["time_ms"], r["si"]["heading"], i) for i, r in enumerate(valid) if "heading" in r["si"]]
        hmethod = "heading_column"
    elif "gyro_z" in mapping:
        acc, last, series = 0.0, None, []
        for i, r in enumerate(valid):
            if "gyro_z" in r["si"]:
                if last is not None:
                    acc += math.degrees(r["si"]["gyro_z"]) * (r["time_ms"] - last) / 1000
                last = r["time_ms"]
                series.append((r["time_ms"], acc, i))
        hmethod = "integrated_yaw_rate"
    if series and len(series) > 2:
        w = thr["heading_window_s"] * 1000
        j0, ep = 0, None  # ep: the current episode {start_idx, peak_idx, peak}
        wrap = hmethod == "heading_column"

        def emit(e):
            add("heading_change", "SEN-HEAD-01", e["a"], e["i"], {"change_deg": round(e["peak"], 1), "method": hmethod, "window_s": thr["heading_window_s"]})

        for t, h, i in series:
            while series[j0][0] < t - w:
                j0 += 1
            d = h - series[j0][1]
            d = (d + 180) % 360 - 180 if wrap else d
            if abs(d) >= thr["heading_change_deg"]:
                if ep is None:
                    ep = {"a": series[j0][2], "i": i, "peak": d}
                elif abs(d) > abs(ep["peak"]):
                    ep["i"], ep["peak"] = i, d
            elif ep is not None and abs(d) < thr["heading_change_deg"] / 2:
                emit(ep)
                ep = None
        if ep is not None:
            emit(ep)
    # gaps
    for g in sample_info["gaps"]:
        ev.append({"event_type": "sensor_gap", "rule_id": "SEN-GAP-01", "category": "direct_observation", "t_start_ms": g["from_ms"], "t_end_ms": g["to_ms"],
                   "uncertainty_ms": 0.0, "source_ref": {"kind": "sensor_rows", "rows": [g["after_row"], g["before_row"]]},
                   "observations": {"duration_ms": g["duration_ms"], "no_samples_between": True}})
    return sorted(ev, key=lambda e: (e["t_start_ms"], e["event_type"]))


def gps_consistency(valid: list[dict], tol: float) -> dict | None:
    """If both GPS and a speed column exist, compare them. Returns a warning dict or None."""
    pts = [r for r in valid if "lat" in r["si"] and "lon" in r["si"] and "speed" in r["si"]]
    if len(pts) < 5:
        return None
    ratios = []
    for a, b in zip(pts, pts[1:]):
        dt = (b["time_ms"] - a["time_ms"]) / 1000
        if dt > 0:
            gps = haversine_m(a["si"]["lat"], a["si"]["lon"], b["si"]["lat"], b["si"]["lon"]) / dt
            if b["si"]["speed"] > 1.0:
                ratios.append(gps / b["si"]["speed"])
    if not ratios:
        return None
    med = statistics.median(ratios)
    return {"median_gps_to_speed_ratio": round(med, 3), "consistent": abs(med - 1) <= tol, "method": "haversine between consecutive fixes"}


def analyze(raw: bytes, mapping: dict, units: dict, clock: str = "relative", tz: str | None = None, sign: dict | None = None,
            thresholds: dict | None = None) -> dict:
    thr = DEFAULT_THRESHOLDS | (thresholds or {})
    header, body, delim = read_table(raw)
    recs, meta = parse_records(header, body, mapping, units, clock, tz, sign or {})
    samp = sampling(recs, thr["gap_factor"])
    events = detect_events(recs, mapping, thr, samp)
    issue_counts: dict[str, int] = {}
    for r in recs:
        for i in r["issues"]:
            issue_counts[i] = issue_counts.get(i, 0) + 1
    return {"records": recs, "events": events, "sampling": samp, "issue_counts": issue_counts, "thresholds": thr, "delimiter": delim,
            "gps_consistency": gps_consistency([r for r in recs if r["valid"]], thr["gps_speed_tolerance"]),
            "rows": len(recs), "valid_rows": sum(r["valid"] for r in recs), "meta": meta, "version": SENSOR_VERSION}
