"""Feasibility probe: can MetaDrive render an ego RGB camera offscreen on this Mac, and does a
COCO-pretrained detector see its vehicles? Not a scenario generator."""
import json, time
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).parent
out = {}
t0 = time.time()
try:
    from metadrive.envs.metadrive_env import MetaDriveEnv
    from metadrive.component.sensors.rgb_camera import RGBCamera

    env = MetaDriveEnv(dict(
        use_render=False,
        image_observation=True,
        norm_pixel=False,
        sensors={"rgb_camera": (RGBCamera, 1280, 720)},
        vehicle_config=dict(image_source="rgb_camera"),
        traffic_density=0.3,
        num_scenarios=1,
        start_seed=7,
        log_level=50,
    ))
    obs, info = env.reset()
    frames = []
    for i in range(60):
        obs, r, term, trunc, info = env.step([0.0, 0.5])
        img = obs["image"][..., -1] if obs["image"].ndim == 4 else obs["image"]
        frames.append(np.asarray(img, dtype=np.uint8))
        ego = env.agent
        if i == 59:
            out["ego_state"] = {"pos": [float(v) for v in ego.position], "speed_kmh": float(ego.speed_km_h),
                                "heading": float(ego.heading_theta)}
    out["sim_seconds_per_step_config"] = float(env.config.get("physics_world_step_size", 0) * env.config.get("decision_repeat", 1))
    env.close()
    out["render_ok"] = True
    out["frame_shape"] = list(frames[-1].shape)
    out["wall_seconds_60_steps"] = round(time.time() - t0, 1)
    cv2.imwrite(str(HERE / "metadrive_frame.jpg"), frames[-1])

    from ultralytics import YOLO
    m = YOLO("yolo26n.pt")
    counts = {}
    for f in frames[::10]:
        r = m.predict(f, imgsz=640, conf=0.25, device="mps", verbose=False)[0]
        for c in r.boxes.cls.tolist():
            counts[r.names[int(c)]] = counts.get(r.names[int(c)], 0) + 1
    out["yolo26n_detections_on_6_frames"] = counts
except Exception as e:
    out["render_ok"] = False
    out["error"] = f"{type(e).__name__}: {e}"[:600]
print(json.dumps(out, indent=2))
(HERE / "probe_metadrive.json").write_text(json.dumps(out, indent=2))
