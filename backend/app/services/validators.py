"""Evidence validation. Each validator returns {"ok", "errors", "warnings", "metadata", "checks"}; it never modifies the file."""
import csv
import json
import statistics
import subprocess
from datetime import datetime
from pathlib import Path

from app.services.video import UnsupportedRotation, canonical_rotation

VALIDATOR_VERSION = "2"


def _result(errors: list[str], warnings: list[str], metadata: dict, checks: dict) -> dict:
    return {"ok": not errors, "errors": errors, "warnings": warnings, "metadata": metadata, "checks": checks,
            "validator_version": VALIDATOR_VERSION}


def _fraction(value: str | None) -> float | None:
    try:
        num, _, den = (value or "").partition("/")
        f = float(num) / float(den or 1)
        return f if f > 0 else None
    except (ValueError, ZeroDivisionError):
        return None


def _run(cmd: list[str], timeout: int) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


# ---------------------------------------------------------------------------------------------------- video
def validate_video(path: Path) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    checks: dict = {}
    metadata: dict = {}
    try:
        probe = _run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)], 60)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return _result([f"ffprobe could not run: {type(exc).__name__}"], [], {}, {"ffprobe": False})
    if probe.returncode != 0:
        return _result(["file is not a readable video container"], [], {}, {"ffprobe": False, "stderr": probe.stderr[:300]})
    info = json.loads(probe.stdout or "{}")
    video = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
    if video is None:
        return _result(["no video stream found"], [], {}, {"ffprobe": True, "video_stream": False})
    fmt = info.get("format", {})
    duration = float(video.get("duration") or fmt.get("duration") or 0)
    if duration <= 0:
        errors.append("video duration is zero or unknown")
    width, height = int(video.get("width") or 0), int(video.get("height") or 0)
    if width <= 0 or height <= 0:
        errors.append("video has no valid dimensions")

    raw_rotation = None
    for sd in video.get("side_data_list", []) or []:
        if "rotation" in sd:
            raw_rotation = sd["rotation"]
    if raw_rotation is None and (video.get("tags") or {}).get("rotate"):
        raw_rotation = video["tags"]["rotate"]
    rotation = None
    try:
        rotation = canonical_rotation(raw_rotation)
    except UnsupportedRotation as exc:
        errors.append(str(exc))

    created = (fmt.get("tags") or {}).get("creation_time")
    created_dt = None
    if created:
        try:
            created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
        except ValueError:
            warnings.append("embedded creation_time is not a valid timestamp; ignored")

    metadata = {
        "duration_ms": int(duration * 1000), "fps_nominal": _fraction(video.get("r_frame_rate")),
        "fps_average": _fraction(video.get("avg_frame_rate")), "width": width, "height": height,
        "codec": video.get("codec_name"), "rotation": rotation,
        "frame_count_declared": int(video["nb_frames"]) if str(video.get("nb_frames", "")).isdigit() else None,
        "creation_time_claimed": created_dt.isoformat() if created_dt else None,
        "audio_streams": sum(1 for s in info["streams"] if s.get("codec_type") == "audio"),
    }

    # packet timestamps: dropped/duplicated frames and variable frame rate
    pk = _run(["ffprobe", "-v", "error", "-select_streams", f"v:{video.get('index', 0)}",
               "-show_entries", "packet=pts_time", "-of", "csv=p=0", str(path)], 120)
    pts = []
    for line in pk.stdout.splitlines():
        try:
            pts.append(float(line.strip().rstrip(",")))
        except ValueError:
            continue
    metadata["packet_count"] = len(pts)
    if len(pts) >= 3:
        ordered = sorted(pts)
        diffs = [b - a for a, b in zip(ordered, ordered[1:])]
        med = statistics.median(diffs)
        gaps = [round(d, 4) for d in diffs if med > 0 and d > 2.5 * med]
        dupes = sum(1 for d in diffs if d <= 1e-9)
        span = ordered[-1] - ordered[0]
        metadata["fps_measured"] = round((len(ordered) - 1) / span, 3) if span > 0 else None
        checks.update({"pts_median_step_s": round(med, 5), "pts_gap_count": len(gaps), "pts_duplicate_count": dupes,
                       "pts_out_of_order": pts != sorted(pts)})
        if gaps:
            warnings.append(f"{len(gaps)} timestamp gap(s) larger than 2.5x the normal frame step (possible dropped frames); largest {max(gaps)} s")
        if dupes:
            warnings.append(f"{dupes} duplicate frame timestamp(s)")
        if pts != sorted(pts):
            warnings.append("frame timestamps are not monotonic in packet order (B-frame reordering is normal; large disorder is not)")
    else:
        metadata["fps_measured"] = None
        warnings.append("too few video packets to assess frame timing")

    # decode sanity on the first seconds; a full decode happens in Phase 3 frame extraction
    dec = _run(["ffmpeg", "-v", "error", "-xerror", "-t", "5", "-i", str(path), "-map", "0:v:0", "-f", "null", "-"], 180)
    checks["decode_first_5s_ok"] = dec.returncode == 0
    if dec.returncode != 0:
        errors.append("video could not be decoded: " + (dec.stderr.strip().splitlines() or ["unknown error"])[0][:200])
    warnings.append("only the first 5 seconds were test-decoded at upload; full decoding is verified during frame extraction")
    return _result(errors, warnings, metadata, checks | {"ffprobe": True, "video_stream": True})


# ---------------------------------------------------------------------------------------------------- sensor csv
def validate_sensor_csv(path: Path) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
        first = f.readline()
        if not first.strip():
            return _result(["file is empty"], [], {}, {})
        delim = max((",", ";", "\t"), key=first.count)
        f.seek(0)
        reader = csv.reader(f, delimiter=delim)
        header = [h.strip() for h in next(reader, [])]
        if len(set(header)) != len(header):
            errors.append("duplicate column names in header")
        if any(not h for h in header):
            warnings.append("one or more header cells are empty")
        rows = ragged = 0
        empty = {h: 0 for h in header}
        ragged_examples: list[int] = []
        for i, row in enumerate(reader, start=2):
            if not any(c.strip() for c in row):
                continue
            rows += 1
            if len(row) != len(header):
                ragged += 1
                if len(ragged_examples) < 5:
                    ragged_examples.append(i)
                continue
            for h, c in zip(header, row):
                if not c.strip():
                    empty[h] += 1
    if rows == 0:
        errors.append("no data rows")
    if ragged:
        errors.append(f"{ragged} row(s) have a different number of columns than the header (lines {ragged_examples})")
    sparse = {h: n for h, n in empty.items() if rows and n / rows > 0.2}
    if sparse:
        warnings.append(f"columns with more than 20% empty cells: {sparse}")
    meta = {"delimiter": delim, "columns": header, "rows": rows, "ragged_rows": ragged, "empty_cells": {h: n for h, n in empty.items() if n}}
    return _result(errors, warnings, meta, {})


# ---------------------------------------------------------------------------------------------------- text / pdf / other
def _read_text(path: Path) -> str:
    raw = path.read_bytes()
    return raw.decode("utf-8-sig")  # raises UnicodeDecodeError for non-UTF-8


def validate_text(path: Path) -> dict:
    try:
        text = _read_text(path)
    except UnicodeDecodeError:
        return _result(["text is not valid UTF-8"], [], {}, {})
    if not text.strip():
        return _result(["text is empty"], [], {}, {})
    warnings = ["contains Windows line endings; character offsets will count CR LF as two characters"] if "\r\n" in text else []
    return _result([], warnings, {"characters": len(text), "lines": text.count("\n") + 1}, {})


def validate_pdf(path: Path) -> dict:
    data = path.read_bytes()
    warnings = ["PDF text is not extracted at upload; extraction happens with witness processing"]
    if b"%%EOF" not in data[-2048:]:
        warnings.append("PDF end-of-file marker not found near the end: the file may be truncated")
    return _result([], warnings, {"bytes": len(data)}, {})


def validate_data_file(path: Path, kind: str) -> dict:
    """annotation / ground_truth: readable UTF-8 text; JSON is detected, not required."""
    base = validate_text(path)
    if not base["ok"]:
        return base
    text = _read_text(path)
    try:
        parsed = json.loads(text)
        base["metadata"]["json"] = type(parsed).__name__
    except ValueError:
        base["metadata"]["json"] = None
    if kind == "ground_truth":
        base["metadata"]["excluded_from_processing"] = True  # evaluation harness only
    return base


def validate(kind: str, path: Path) -> dict:
    if kind in ("dashcam", "cctv", "other"):
        return validate_video(path)
    if kind == "sensor_csv":
        return validate_sensor_csv(path)
    if kind == "witness_text":
        return validate_text(path)
    if kind == "witness_pdf":
        return validate_pdf(path)
    return validate_data_file(path, kind)
