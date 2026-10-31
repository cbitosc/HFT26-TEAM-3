"""Synthetic accident scenarios: a tiny kinematic world, renderers, sensor synthesis, witness texts, and exact ground truth.

EVERYTHING produced here is synthetic. Vehicles are rectangles moving along paths with piecewise-linear speed profiles; there
is no crash physics (after contact the parties simply stop). Detections for these videos come from the world model itself
(an explicit "oracle" import), because a COCO detector is not expected to recognise drawn rectangles. Evaluation results on
these scenarios therefore test the reconstruction logic, not detector or tracker performance on real footage.

World frame: meters, x to the right (east), y DOWN the screen (south), like image coordinates. Heading 0 = east.
"""
import csv
import io
import json
import math
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

W, H, FPS = 640, 360, 10
SCALE = 12.0  # pixels per meter in the top-down CCTV render (scene is 53.3 x 30 m)
CAR = (4.5, 1.9)
PED = (0.7, 0.7)
CAM_H, FX = 1.2, 200.0  # dashcam height (m) and focal length (px)


@dataclass
class Actor:
    key: str
    label: str
    kind: str                  # vehicle | pedestrian
    color: tuple               # BGR
    path: list                 # polyline [(x, y), ...] in meters
    speed: list                # [(t, v)] piecewise-linear speed profile (m/s), t in world seconds
    size: tuple = CAR
    attributes: dict = field(default_factory=dict)
    t0: float = 0.0

    def dist(self, t: float) -> float:
        ts = [p[0] for p in self.speed]
        if t <= ts[0]:
            return 0.0
        d, prev_t, prev_v = 0.0, ts[0], self.speed[0][1]
        for tt, vv in self.speed[1:]:
            seg = min(t, tt)
            if seg > prev_t:
                v_end = prev_v + (vv - prev_v) * (seg - prev_t) / (tt - prev_t) if tt > prev_t else vv
                d += 0.5 * (prev_v + v_end) * (seg - prev_t)
            if t <= tt:
                return d
            prev_t, prev_v = tt, vv
        return d + prev_v * (t - prev_t)

    def speed_at(self, t: float) -> float:
        ts = self.speed
        if t <= ts[0][0]:
            return ts[0][1]
        for (t1, v1), (t2, v2) in zip(ts, ts[1:]):
            if t <= t2:
                return v1 + (v2 - v1) * (t - t1) / (t2 - t1) if t2 > t1 else v2
        return ts[-1][1]

    def pose(self, t: float) -> tuple[float, float, float]:
        """(x, y, heading_rad)"""
        s = self.dist(t)
        pts = self.path
        acc = 0.0
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            seg = math.hypot(x2 - x1, y2 - y1)
            if s <= acc + seg or (x2, y2) == pts[-1]:
                f = min(1.0, max(0.0, (s - acc) / seg)) if seg else 0.0
                return x1 + (x2 - x1) * f, y1 + (y2 - y1) * f, math.atan2(y2 - y1, x2 - x1)
            acc += seg
        return (*pts[-1], 0.0)

    def corners(self, t: float) -> np.ndarray:
        x, y, h = self.pose(t)
        L, Wd = self.size
        c, s = math.cos(h), math.sin(h)
        return np.array([(x + c * dx - s * dy, y + s * dx + c * dy) for dx, dy in ((L / 2, Wd / 2), (L / 2, -Wd / 2), (-L / 2, -Wd / 2), (-L / 2, Wd / 2))])


def obb_overlap(a: np.ndarray, b: np.ndarray) -> bool:
    """Separating-axis test for two convex quadrilaterals."""
    for poly in (a, b):
        for i in range(4):
            e = poly[(i + 1) % 4] - poly[i]
            n = np.array([-e[1], e[0]])
            pa, pb = a @ n, b @ n
            if pa.max() < pb.min() or pb.max() < pa.min():
                return False
    return True


@dataclass
class Scenario:
    id: str
    title: str
    actors: list
    duration: float
    cctv_start: float = 0.0          # world time at CCTV media time 0
    dash_start: float | None = None  # world time at dashcam media time 0
    dash_ego: str | None = None
    imu_start: float | None = None
    imu_actor: str | None = None
    imu_hz: int = 20
    witnesses: list = field(default_factory=list)      # [(label, text, scripted)]
    degrade: dict = field(default_factory=dict)        # dark, blur, occluder, drop_frames (cctv media seconds), imu_gap (imu seconds)
    flash_at: float | None = None
    declared_bound_ms: float = 100.0

    def actor(self, key):
        return next(a for a in self.actors if a.key == key)

    # ---------------------------------------------------------------- ground truth
    def contacts(self, step=0.02):
        """First time each pair of actors overlaps (stylized contact; the parties then stop)."""
        out, t = {}, 0.0
        while t <= self.duration + 5:
            for i, a in enumerate(self.actors):
                for b in self.actors[i + 1:]:
                    k = (a.key, b.key)
                    if k not in out and obb_overlap(a.corners(t), b.corners(t)):
                        out[k] = round(t, 3)
            t += step
        return out

    # ---------------------------------------------------------------- CCTV render + boxes
    def px(self, x, y):
        return int(round(x * SCALE)), int(round(y * SCALE))

    def cctv_boxes(self, media_ms: float, include_occluded=False) -> list[dict]:
        t = self.cctv_start + media_ms / 1000
        out = []
        for a in self.actors:
            pts = a.corners(t) * SCALE
            x1, y1, x2, y2 = pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max(), pts[:, 1].max()
            cx1, cy1, cx2, cy2 = max(0, x1), max(0, y1), min(W, x2), min(H, y2)
            if cx2 - cx1 < 8 or cy2 - cy1 < 8 or (cx2 - cx1) * (cy2 - cy1) < 0.5 * (x2 - x1) * (y2 - y1):
                continue  # mostly outside the image
            if not include_occluded and self._occluded(t, (cx1, cy1, cx2, cy2)):
                continue
            out.append({"actor": a.key, "class": "pedestrian" if a.kind == "pedestrian" else "car", "confidence": 0.9, "bbox": [round(cx1, 1), round(cy1, 1), round(cx2, 1), round(cy2, 1)]})
        return out

    def _occluder(self, t):
        o = self.degrade.get("occluder")
        return None if not o else (o["x1"], o["y1"], o["x2"], o["y2"], o["t1"], o["t2"])

    def _occluded(self, t, box) -> bool:
        o = self._occluder(t)
        if not o or not (o[4] <= t <= o[5]):
            return False
        ix = max(0, min(box[2], o[2]) - max(box[0], o[0]))
        iy = max(0, min(box[3], o[3]) - max(box[1], o[1]))
        return ix * iy > 0.6 * (box[2] - box[0]) * (box[3] - box[1])

    def render_cctv_frame(self, media_ms: float) -> np.ndarray:
        t = self.cctv_start + media_ms / 1000
        img = np.full((H, W, 3), (70, 110, 70), np.uint8)                                   # grass
        cv2.rectangle(img, (0, int(12 * SCALE)), (W, int(18 * SCALE)), (80, 80, 84), -1)    # east-west road y in [12, 18]
        cv2.rectangle(img, (int(25.5 * SCALE), 0), (int(31.5 * SCALE), H), (80, 80, 84), -1)  # north-south road x in [25.5, 31.5]
        for xx in range(0, W, 40):
            cv2.line(img, (xx, int(15 * SCALE)), (xx + 20, int(15 * SCALE)), (200, 200, 200), 1)
        for yy in range(0, H, 40):
            cv2.line(img, (int(28.5 * SCALE), yy), (int(28.5 * SCALE), yy + 20), (200, 200, 200), 1)
        for a in self.actors:
            pts = (a.corners(t) * SCALE).astype(np.int32)
            cv2.fillConvexPoly(img, pts, a.color)
            cv2.polylines(img, [pts], True, (20, 20, 20), 1)
        o = self._occluder(t)
        if o and o[4] <= t <= o[5]:
            cv2.rectangle(img, (int(o[0]), int(o[1])), (int(o[2]), int(o[3])), (40, 40, 45), -1)
        return self._finish(img, t)

    # ---------------------------------------------------------------- dashcam render + boxes
    def _ego_rel(self, t, a):
        ex, ey, eh = self.actor(self.dash_ego).pose(t)
        x, y, _ = a.pose(t)
        dx, dy = x - ex, y - ey
        fwd = dx * math.cos(eh) + dy * math.sin(eh) - 1.2     # camera 1.2 m behind the ego front... relative to the camera
        lat = -dx * math.sin(eh) + dy * math.cos(eh)           # + = right of the ego heading
        return fwd, lat

    def dash_boxes(self, media_ms: float) -> list[dict]:
        t = (self.dash_start or 0) + media_ms / 1000
        out = []
        cy = H * 0.42
        for a in self.actors:
            if a.key == self.dash_ego:
                continue
            fwd, lat = self._ego_rel(t, a)
            if fwd < 1.0:
                continue
            width = max(a.size) * 0.65 if a.kind == "vehicle" else a.size[0]
            height = 1.5 if a.kind == "vehicle" else 1.7
            u = W / 2 + FX * lat / fwd
            w_px, h_px = FX * width / fwd, FX * height / fwd
            bottom = cy + FX * CAM_H / fwd
            x1, y1, x2, y2 = u - w_px / 2, bottom - h_px, u + w_px / 2, bottom
            cx1, cy1, cx2, cy2 = max(0, x1), max(0, y1), min(W, x2), min(H, y2)
            if cx2 - cx1 < 6 or cy2 - cy1 < 6 or (cx2 - cx1) * (cy2 - cy1) < 0.4 * (x2 - x1) * (y2 - y1):
                continue
            out.append({"actor": a.key, "class": "pedestrian" if a.kind == "pedestrian" else "car", "confidence": 0.9, "bbox": [round(cx1, 1), round(cy1, 1), round(cx2, 1), round(cy2, 1)],
                        "_color": a.color})
        return out

    def render_dash_frame(self, media_ms: float) -> np.ndarray:
        t = (self.dash_start or 0) + media_ms / 1000
        img = np.zeros((H, W, 3), np.uint8)
        hor = int(H * 0.42)
        img[:hor] = (200, 190, 170)                                            # sky
        img[hor:] = (75, 75, 80)                                               # road
        cv2.line(img, (W // 2, H), (W // 2, hor), (190, 190, 190), 1)
        for b in sorted(self.dash_boxes(media_ms), key=lambda d: d["bbox"][3]):
            x1, y1, x2, y2 = (int(v) for v in b["bbox"])
            cv2.rectangle(img, (x1, y1), (x2, y2), b["_color"], -1)
            cv2.rectangle(img, (x1, y1), (x2, y2), (20, 20, 20), 1)
        return self._finish(img, t)

    def _finish(self, img, t):
        d = self.degrade
        if d.get("dark"):
            img = (img * d["dark"]).astype(np.uint8)
        if d.get("blur"):
            img = cv2.GaussianBlur(img, (0, 0), d["blur"])
        if d.get("noise"):
            img = np.clip(img.astype(np.int16) + np.random.default_rng(int(t * 1000)).normal(0, d["noise"], img.shape), 0, 255).astype(np.uint8)
        if self.flash_at is not None and abs(t - self.flash_at) < 0.5 / FPS:
            img = np.full_like(img, 255)
        return img

    # ---------------------------------------------------------------- files
    def write_video(self, path: Path, which: str) -> list[float]:
        """Encode to H.264. Returns the list of media times (s) actually present (after any dropped frames)."""
        start = self.cctv_start if which == "cctv" else self.dash_start
        n = int(self.duration * FPS)
        render = self.render_cctv_frame if which == "cctv" else self.render_dash_frame
        proc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                                 "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", str(path)], stdin=subprocess.PIPE)
        for i in range(n):
            proc.stdin.write(render(i * 1000 / FPS).tobytes())
        proc.stdin.close()
        proc.wait()
        drop = self.degrade.get("drop_frames") if which == "cctv" else None
        times = [i / FPS for i in range(n)]
        if drop:
            a, b = (int(drop[0] * FPS), int(drop[1] * FPS))
            tmp = path.with_suffix(".tmp.mp4")
            path.rename(tmp)
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(tmp), "-vf", f"select='not(between(n,{a},{b}))'", "-vsync", "0",
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", str(path)], check=True)
            tmp.unlink()
            times = [t for i, t in enumerate(times) if not a <= i <= b]
        return times

    def imu_rows(self) -> list[list]:
        a = self.actor(self.imu_actor)
        rng = np.random.default_rng(7)
        hit = min([t for (x, y), t in self.contacts().items() if self.imu_actor in (x, y)] or [None], default=None) if self.contacts() else None
        rows = []
        n = int(self.duration * self.imu_hz)
        gap = self.degrade.get("imu_gap")
        for i in range(n):
            ti = i / self.imu_hz                    # imu time
            t = (self.imu_start or 0) + ti          # world time
            if gap and gap[0] <= ti < gap[1]:
                continue
            v = a.speed_at(t)
            ax = (a.speed_at(t + 0.05) - a.speed_at(t - 0.05)) / 0.1 / 9.80665 + rng.normal(0, 0.02)
            ay = rng.normal(0, 0.02)
            coll = 0
            if hit is not None and hit <= t < hit + 0.3:
                ax -= 1.8
                coll = 1
            _, _, hd = a.pose(t)
            rows.append([round(ti, 3), round(v * 3.6 + rng.normal(0, 0.15), 2), round(ax, 4), round(ay, 4), round(math.degrees(hd) % 360, 1), coll])
        return rows

    def imu_csv(self) -> bytes:
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["time_s", "speed_kmh", "accel_long_g", "accel_lat_g", "heading_deg", "collision_flag"])
        w.writerows(self.imu_rows())
        return buf.getvalue().encode()

    IMU_SPEC = {"mapping": {"t": "time_s", "speed": "speed_kmh", "accel_long": "accel_long_g", "accel_lat": "accel_lat_g", "heading": "heading_deg", "collision": "collision_flag"},
                "units": {"t": "s", "speed": "km/h", "accel_long": "g", "accel_lat": "g", "heading": "deg"}, "clock": "simulation"}

    def calibration_points(self) -> list[dict]:
        pts = [(0, 0), (53, 0), (0, 30), (53, 30), (26, 15), (13, 15)]
        return [{"image": [x * SCALE, y * SCALE], "ground": [x, y]} for x, y in pts]

    def ground_truth(self) -> dict:
        c = self.contacts()
        events = []
        for a in self.actors:
            ts = [i / 50 for i in range(int(self.duration * 50))]
            sp = [a.speed_at(t) for t in ts]
            for t0, t1 in zip(ts, ts[1:]):
                pass
            braking = [t for t in ts if (a.speed_at(t + 0.05) - a.speed_at(t - 0.05)) / 0.1 <= -3.0]
            if braking:
                events.append({"type": "hard_braking", "actor": a.key, "t_world": round(braking[0], 2), "t_end_world": round(braking[-1], 2)})
        for (x, y), t in c.items():
            events.append({"type": "contact", "actors": [x, y], "t_world": t})
        return {"scenario": self.id, "synthetic": True, "actors": {a.key: {"label": a.label, **a.attributes} for a in self.actors}, "contacts": [{"actors": list(k), "t_world": v} for k, v in c.items()],
                "events": sorted(events, key=lambda e: e["t_world"]),
                "clock": {"cctv_start_world_s": self.cctv_start, "dash_start_world_s": self.dash_start, "imu_start_world_s": self.imu_start},
                "trajectories_world_m": {a.key: [[round(t, 2), *[round(v, 3) for v in a.pose(t)[:2]]] for t in np.arange(0, self.duration, 0.5)] for a in self.actors}}

    def declared_edges(self) -> list[dict]:
        """What an investigator who knows the recording start times would declare (relations between source clocks)."""
        out = []
        if self.dash_start is not None:
            out.append({"a": "cctv", "b": "dashcam", "offset_ms": -(self.dash_start - self.cctv_start) * 1000, "bound_ms": self.declared_bound_ms, "basis": "known_offset"})
        if self.imu_start is not None:
            out.append({"a": "cctv", "b": "imu", "offset_ms": -(self.imu_start - self.cctv_start) * 1000, "bound_ms": self.declared_bound_ms, "basis": "known_offset"})
        return out


# --------------------------------------------------------------------------------------------- the four scenarios
def lane(y, x0=-60.0, x1=120.0):
    return [(x0, y), (x1, y)]


def scenario_a() -> Scenario:
    a = Actor("A", "Vehicle A (blue car)", "vehicle", (200, 90, 30), [(-50.2, 13.5), (120, 13.5)], [(0, 10), (7.0, 10), (7.8, 6.0), (9.0, 0.0), (30, 0.0)],
              attributes={"color": "blue", "type": "car", "ego": True})
    b = Actor("B", "Vehicle B (white car)", "vehicle", (235, 235, 235), [(28.5, 79.1), (28.5, -60)], [(0, 8), (7.8, 8), (8.6, 0.0), (30, 0.0)], attributes={"color": "white", "type": "car"})
    return Scenario("A_intersection_collision", "Intersection collision", [a, b], duration=10.0, cctv_start=3.0, dash_start=4.0, dash_ego="A", imu_start=3.4, imu_actor="A",
                    flash_at=5.0, witnesses=[
                        ("Witness 1 (observer, staged)", "The blue car kept going straight through the junction when the white car came out from the south. I think the blue car braked just before the impact.", False),
                        ("Witness 2 (scripted contradiction)", "I saw the blue car turn left just before the collision. The white car was moving very fast.", True)])


def scenario_b() -> Scenario:
    lead = Actor("L", "Lead car (white)", "vehicle", (235, 235, 235), [(-40, 13.5), (120, 13.5)], [(0, 10), (5.0, 10), (6.4, 0.0), (30, 0.0)], attributes={"color": "white", "type": "car"})
    foll = Actor("F", "Following car (blue)", "vehicle", (200, 90, 30), [(-62, 13.5), (120, 13.5)], [(0, 12), (5.9, 12), (7.4, 3.0), (7.6, 0.0), (30, 0.0)], attributes={"color": "blue", "type": "car"})
    return Scenario("B_rear_end", "Rear-end collision", [lead, foll], duration=8.0, cctv_start=3.0, imu_start=2.6, imu_actor="L", flash_at=None, witnesses=[
        ("Witness 1 (observer, staged)", "The white car in front braked suddenly and the blue car behind it could not stop in time.", False),
        ("Witness 2 (vague)", "The blue car was going really fast.", True)])


def scenario_c() -> Scenario:
    car = Actor("P", "Car (silver)", "vehicle", (190, 190, 190), [(-30, 13.5), (120, 13.5)], [(0, 8), (6.2, 8), (8.0, 0.0), (30, 0.0)], attributes={"color": "silver", "type": "car"})
    ped = Actor("X", "Pedestrian", "pedestrian", (40, 40, 220), [(30.2, 10.5), (30.2, 26.0)], [(0, 0), (5.5, 0), (5.7, 1.3), (30, 1.3)], size=PED, attributes={"type": "pedestrian"})
    return Scenario("C_pedestrian_near_miss", "Pedestrian near miss", [car, ped], duration=9.0, cctv_start=3.0, imu_start=2.4, imu_actor="P", witnesses=[
        ("Witness 1 (scripted contradiction)", "The car did not stop and hit the man crossing the road.", True),
        ("Witness 2 (observer, staged)", "The silver car stopped just in time, a metre or so before the man.", False)])


def scenario_d() -> Scenario:
    s = scenario_a()
    s.id, s.title = "D_incomplete_evidence", "Incomplete low-quality evidence"
    s.degrade = {"dark": 0.55, "blur": 2.2, "noise": 6, "drop_frames": (4.2, 5.6), "imu_gap": (3.9, 4.9),
                 "occluder": {"x1": 24 * SCALE, "y1": 8 * SCALE, "x2": 34 * SCALE, "y2": 11.5 * SCALE, "t1": 6.4, "t2": 8.8}}
    s.witnesses = [
        ("Witness 1 (approximate)", "Around six in the evening the blue car went straight on. Then there was a bang.", False),
        ("Witness 2 (conflicting)", "The white car stopped first and then the blue car turned into it.", True),
        ("Witness 3 (vague)", "It was dark and I only saw the lights.", False)]
    return s


ALL = {"A": scenario_a, "B": scenario_b, "C": scenario_c, "D": scenario_d}


def write_package(s: Scenario, out: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    manifest = {"scenario_id": s.id, "title": s.title, "designation": "synthetic", "generator": "backend/scenarios/world.py (kinematic world, stylized contact, no physics)",
                "files": {}, "declared_edges": s.declared_edges(), "calibration_points_cctv": s.calibration_points(), "imu_spec": s.IMU_SPEC if s.imu_actor else None,
                "witnesses": [{"label": l, "scripted": sc} for l, _, sc in s.witnesses], "degrade": {k: v for k, v in s.degrade.items() if k != "occluder"} or None}
    present = {"cctv": s.write_video(out / "cctv.mp4", "cctv")}
    manifest["files"]["cctv"] = "cctv.mp4"
    manifest["cctv_present_media_s"] = [round(min(present["cctv"]), 2), round(max(present["cctv"]), 2), len(present["cctv"])]
    if s.dash_start is not None:
        s.write_video(out / "dashcam.mp4", "dash")
        manifest["files"]["dashcam"] = "dashcam.mp4"
    if s.imu_actor:
        (out / "imu.csv").write_bytes(s.imu_csv())
        manifest["files"]["imu"] = "imu.csv"
    for i, (label, text, _) in enumerate(s.witnesses, 1):
        (out / f"witness_{i}.txt").write_text(text + "\n")
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    (out / "ground_truth.json").write_text(json.dumps(s.ground_truth(), indent=2))
    return manifest
