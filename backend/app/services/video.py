"""Video preprocessing: frame timestamps, sampling, decode + quality metrics + thumbnails, browser playback copy.

Time convention (used everywhere downstream): a frame's `time_ms` is its media time from the first frame, computed from the
container PTS. The container PTS of the first frame is kept separately (`pts_start_ms`). The playback copy is re-timed to start
at 0, so `<video>.currentTime * 1000` in the browser equals `time_ms`.
"""
import bisect
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np

PREPROCESS_VERSION = "2"


class UnsupportedRotation(ValueError):
    """The container display matrix is not 0, 90, 180 or 270 degrees."""


def canonical_rotation(value) -> int | None:
    """Normalize a display-matrix angle to 90, 180 or 270. None means the coded frame is already upright.

    ffprobe reports 180° as -180 and 270° as -90. Other angles, including 45°, cannot be baked once into
    upright pixels, so they are refused instead of being ignored or applied twice.
    """
    if value is None or value == "":
        return None
    try:
        r = int(value) % 360
    except (TypeError, ValueError) as exc:
        raise UnsupportedRotation(
            f"Display rotation {value!r} cannot be applied. Supported rotations are 0, 90, 180 and 270 degrees, "
            "taken once from the container display matrix."
        ) from exc
    if r < 0:
        r += 360
    if r == 0:
        return None
    if r not in (90, 180, 270):
        raise UnsupportedRotation(
            f"Display rotation {value}° cannot be applied. Supported rotations are 0, 90, 180 and 270 degrees, "
            "taken once from the container display matrix."
        )
    return r


def display_size(width: int, height: int, rotation: int | None) -> tuple[int, int]:
    """Pixel size of an upright frame. 90° and 270° swap the coded width and height; 180° does not."""
    if canonical_rotation(rotation) in (90, 270):
        return int(height), int(width)
    return int(width), int(height)


def _open_capture(path: Path, rotation: int | None):
    """Open a video the way the player will show the playback copy.

    OpenCV's orientation flag applies the display matrix once. This function does not rotate again.
    A build that leaves the flag off cannot be used for a rotated file, because the boxes would not
    match an upright playback file.
    """
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError("OpenCV could not open the video")
    rot = canonical_rotation(rotation)
    if rot:
        prop = getattr(cv2, "CAP_PROP_ORIENTATION_AUTO", None)
        if prop is None or cap.get(prop) < 0.5:
            cap.release()
            raise RuntimeError(
                f"Display rotation {rot}° cannot be applied: OpenCV is not honoring the container display matrix. "
                "Refusing to decode so detection coordinates are not stored in a different orientation than the player."
            )
    return cap


def _run(cmd: list[str], timeout: int = 600) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def probe_frame_pts(path: Path) -> list[float]:
    """Presentation timestamps (seconds) of every video packet, in presentation order. Falls back to DTS when PTS is absent."""
    out = _run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,dts_time", "-of", "json", str(path)]).stdout
    packets = json.loads(out or "{}").get("packets", [])
    times = []
    for p in packets:
        t = p.get("pts_time", p.get("dts_time"))
        try:
            times.append(float(t))
        except (TypeError, ValueError):
            continue
    return sorted(times)


def choose_sampled(rel_ms: list[float], sample_fps: float, max_frames: int) -> tuple[list[int], bool]:
    """Indices of frames nearest to a regular time grid at `sample_fps`. Gaps in the video produce no samples (never invented).

    Returns (sorted indices, truncated_by_max_frames)."""
    if not rel_ms:
        return [], False
    step = 1000.0 / sample_fps
    chosen: list[int] = []
    k = 0
    while (target := rel_ms[0] + k * step) <= rel_ms[-1] + 0.5:  # grid never extends past the last real frame (0.5 ms absorbs container timestamp rounding)
        i = bisect.bisect_left(rel_ms, target)
        cands = [j for j in (i - 1, i) if 0 <= j < len(rel_ms)]
        j = min(cands, key=lambda c: abs(rel_ms[c] - target))
        if abs(rel_ms[j] - target) <= step / 2 and (not chosen or chosen[-1] != j):
            chosen.append(j)
        k += 1
    truncated = len(chosen) > max_frames
    return chosen[:max_frames], truncated


def frame_quality(img: np.ndarray) -> tuple[float, float]:
    """(blur, brightness): variance of the Laplacian (lower = blurrier; scale depends on resolution) and mean luma 0-255."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var()), float(gray.mean())


def _thumbnail(img: np.ndarray, width: int) -> np.ndarray:
    h, w = img.shape[:2]
    if w <= width:
        return img
    return cv2.resize(img, (width, max(1, round(h * width / w))), interpolation=cv2.INTER_AREA)


def decode_selected(path: Path, wanted: set[int], thumb_dir: Path, thumb_width: int, rel_ms: list[float], progress=None, rotation: int | None = None) -> dict:
    """Decode the video once, sequentially. For wanted frame indices: quality metrics + JPEG thumbnail.

    Also cross-checks the decoder's own timestamps against the container PTS (relative to the first frame).
    `progress(done, total)` is called with frames grabbed so far and the container frame count. It is not a clock."""
    thumb_dir.mkdir(parents=True, exist_ok=True)
    cap = _open_capture(path, rotation)
    frames: dict[int, dict] = {}
    idx, max_dev, first_cv = 0, 0.0, None
    expected = len(rel_ms)
    try:
        while cap.grab():
            cv_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            first_cv = cv_ms if first_cv is None else first_cv
            if idx < expected:
                max_dev = max(max_dev, abs((cv_ms - first_cv) - rel_ms[idx]))
            if idx in wanted:
                ok, img = cap.retrieve()
                if ok and img is not None:
                    blur, bright = frame_quality(img)
                    name = f"f{idx:06d}.jpg"
                    cv2.imwrite(str(thumb_dir / name), _thumbnail(img, thumb_width), [cv2.IMWRITE_JPEG_QUALITY, 82])
                    frames[idx] = {"blur": blur, "brightness": bright, "thumb": name, "height": img.shape[0], "width": img.shape[1]}
            idx += 1
            if progress is not None and expected:
                progress(idx, expected)
    finally:
        cap.release()
    return {"frames": frames, "decoded_count": idx, "max_pts_deviation_ms": round(max_dev, 3)}


def iter_frames(path: Path, wanted: set[int], rotation: int | None = None):
    """Decode sequentially and yield (frame_index, BGR image) for the wanted indices (presentation order, same as the index).

    `rotation` is the container display matrix. The capture applies it once; the image is not rotated again here.
    """
    cap = _open_capture(path, rotation)
    last = max(wanted) if wanted else -1
    idx = 0
    try:
        while idx <= last and cap.grab():
            if idx in wanted:
                ok, img = cap.retrieve()
                if ok and img is not None:
                    yield idx, img
            idx += 1
    finally:
        cap.release()


# ---------------------------------------------------------------------------------------------------- playback copy
def _video_stream(path: Path) -> dict:
    info = json.loads(_run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)]).stdout or "{}")
    v = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
    v["_audio"] = sum(1 for s in info.get("streams", []) if s.get("codec_type") == "audio")
    v["_format"] = info.get("format", {}).get("format_name", "")
    return v


def browser_compatible(stream: dict, pts_start_ms: float, rotation: int | None) -> bool:
    # Height is not capped. A 1080 scale made /stream smaller than the decoded frame, so boxes drawn with
    # videoWidth no longer matched the detections. A rotated file is transcoded so the matrix is baked once.
    return (stream.get("codec_name") == "h264" and stream.get("pix_fmt") == "yuv420p" and "mp4" in stream.get("_format", "")
            and not canonical_rotation(rotation) and abs(pts_start_ms) < 0.5)


def make_playback(src: Path, dst: Path, pts_start_ms: float, rotation: int | None) -> dict:
    """Write a browser-safe H.264 MP4 that starts at t=0 and keeps every frame's relative timing. Then verify that it does.

    The copy keeps the upright frame size. ffmpeg applies a display matrix once, before the filter graph, and the
    output has no matrix of its own. Do not add a rotate filter and do not pass -noautorotate: either one turns
    that single rotation into a second one. Detection uses the same upright pixels.
    """
    rot = canonical_rotation(rotation)
    stream = _video_stream(src)
    if browser_compatible(stream, pts_start_ms, rot):
        mode = "remux"
        cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(src), "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", str(dst)]
    else:
        mode = "transcode"
        cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(src), "-map", "0:v:0",
               "-vf", "setpts=PTS-STARTPTS,format=yuv420p",
               "-vsync", "0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]
        if stream.get("_audio"):
            cmd += ["-map", "0:a:0", "-af", "asetpts=PTS-STARTPTS", "-c:a", "aac", "-b:a", "96k"]
        cmd += ["-movflags", "+faststart", str(dst)]
    r = _run(cmd, timeout=1800)
    if r.returncode != 0:
        raise RuntimeError("playback copy failed: " + (r.stderr.strip().splitlines() or ["unknown"])[-1][:200])

    src_pts, out_pts = probe_frame_pts(src), probe_frame_pts(dst)
    src_rel = [(t - src_pts[0]) * 1000 for t in src_pts] if src_pts else []
    out_rel = [(t - out_pts[0]) * 1000 for t in out_pts] if out_pts else []
    same_count = len(src_rel) == len(out_rel)
    dev = max((abs(a - b) for a, b in zip(src_rel, out_rel)), default=0.0)
    return {"mode": mode, "frames_source": len(src_rel), "frames_copy": len(out_rel), "starts_at_ms": round(out_pts[0] * 1000, 3) if out_pts else None,
            "max_timing_deviation_ms": round(dev, 3), "timing_preserved": same_count and dev <= 1.0}


def extract_full_frame(src: Path, rel_time_ms: float, dst: Path) -> None:
    """Full-resolution JPEG of the frame at media time `rel_time_ms` (relative to the first frame), frame-accurate."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    r = _run(["ffmpeg", "-y", "-v", "error", "-ss", f"{rel_time_ms / 1000:.6f}", "-i", str(src), "-frames:v", "1", "-q:v", "2", str(dst)], timeout=120)
    if r.returncode != 0 or not dst.is_file():
        raise RuntimeError("frame extraction failed")


def ffmpeg_version() -> str:
    try:
        return _run(["ffmpeg", "-version"], timeout=10).stdout.split("\n", 1)[0].split(" ")[2]
    except Exception:  # noqa: BLE001
        return "unknown"
