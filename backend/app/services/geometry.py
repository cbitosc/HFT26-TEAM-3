"""Camera calibration as a ground-plane homography, and projection. No metres are produced without a valid calibration."""
import math

import cv2
import numpy as np

GEOMETRY_VERSION = "1"


class CalibrationError(ValueError):
    pass


def hull(points: np.ndarray) -> np.ndarray:
    return cv2.convexHull(points.astype(np.float32)).reshape(-1, 2)


def fit_homography(points: list[dict], frame_w: int, frame_h: int) -> dict:
    """points: [{image:[x,y], ground:[X,Y]}] (ground units, e.g. metres). Least-squares homography image -> ground."""
    if len(points) < 4:
        raise CalibrationError("at least 4 reference points are needed")
    img = np.array([p["image"] for p in points], dtype=np.float64)
    gnd = np.array([p["ground"] for p in points], dtype=np.float64)
    if len({tuple(p) for p in img.round(1).tolist()}) < len(points):
        raise CalibrationError("duplicate image points")
    h_img = hull(img)
    area_frac = cv2.contourArea(h_img) / float(frame_w * frame_h)
    if area_frac < 0.05:
        raise CalibrationError(f"reference points cover only {area_frac:.1%} of the frame (collinear or clustered): spread them out")
    H, _ = cv2.findHomography(img, gnd, method=0)
    if H is None or not np.isfinite(H).all() or abs(np.linalg.det(H)) < 1e-12:
        raise CalibrationError("the reference points do not define a valid ground-plane mapping")
    proj = cv2.perspectiveTransform(img.reshape(-1, 1, 2), H).reshape(-1, 2)
    err = np.hypot(*(proj - gnd).T)
    Hinv = np.linalg.inv(H)
    back = cv2.perspectiveTransform(gnd.reshape(-1, 1, 2), Hinv).reshape(-1, 2)
    err_px = np.hypot(*(back - img).T)
    span = float(np.hypot(*(gnd.max(axis=0) - gnd.min(axis=0))))
    rms, mx = float(np.sqrt(np.mean(err ** 2))), float(err.max())
    quality = "good" if rms <= 0.02 * span else "poor"
    return {"H": H.tolist(), "rms_error_ground": round(rms, 4), "max_error_ground": round(mx, 4), "rms_error_px": round(float(np.sqrt(np.mean(err_px ** 2))), 3),
            "ground_span": round(span, 3), "quality": quality, "usable_for_metric": quality == "good", "n_points": len(points),
            "valid_region": h_img.round(1).tolist(), "frame": [frame_w, frame_h], "points": points,
            "assumptions": "flat ground plane; points measured on that plane; the camera is not moved after calibration"}


def inside(region: list, x: float, y: float) -> bool:
    return cv2.pointPolygonTest(np.array(region, dtype=np.float32).reshape(-1, 1, 2), (float(x), float(y)), False) >= 0


def project(H: list, x: float, y: float) -> tuple[float, float]:
    v = np.array(H) @ np.array([x, y, 1.0])
    return float(v[0] / v[2]), float(v[1] / v[2])


def ground_uncertainty(H: list, x: float, y: float, pixel_sigma: float, rms: float) -> float:
    """Approximate 1-sigma ground error (units) at an image point: local scale of the mapping times the pixel error, plus calibration residual."""
    a = np.array(project(H, x + 1, y)) - np.array(project(H, x, y))
    b = np.array(project(H, x, y + 1)) - np.array(project(H, x, y))
    scale = math.sqrt(max(np.linalg.norm(a), np.linalg.norm(b)) ** 2)
    return float(math.hypot(scale * pixel_sigma, rms))
