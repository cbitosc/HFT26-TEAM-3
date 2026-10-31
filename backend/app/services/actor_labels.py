"""Featherless visual label suggestions for tracks around a candidate accident moment."""
import base64
import io
import json
import re

from PIL import Image, ImageDraw


PROMPT = """You label visible road users in accident-review frames. Coloured boxes are tagged TRACK <number>.
Return JSON only: {"suggestions":[{"track_id":1,"object_type":"car","color":"white","role":"vehicle near incident","confidence":0.0,"uncertainty":"short reason"}]}.
Describe only visible attributes. Never guess make, model, registration, person identity, fault, speed, contact, or injury.
Use one of: car, motorcycle, truck, bus, bicycle, pedestrian, unknown vehicle. Color must be a basic visible colour or unknown.
Include only the requested track IDs. Confidence is confidence in the visual description, not accident probability."""

ALLOWED_TYPES = {"car", "motorcycle", "truck", "bus", "bicycle", "pedestrian", "unknown vehicle"}
ALLOWED_COLORS = {"black", "white", "silver", "gray", "grey", "red", "blue", "green", "yellow", "orange", "brown", "unknown"}


def annotated_data_url(path, tracks, time_ms, width, height):
    image = Image.open(path).convert("RGB")
    sx, sy = image.width / max(width, 1), image.height / max(height, 1)
    draw = ImageDraw.Draw(image)
    colors = ["#ff642e", "#2ed3ff", "#62e6a7", "#ffd447"]
    for index, track in enumerate(tracks):
        points = track.points or []
        if not points:
            continue
        point = min(points, key=lambda p: abs(int(p.get("time_ms", 0)) - time_ms))
        if abs(int(point.get("time_ms", 0)) - time_ms) > 700:
            continue
        x1, y1, x2, y2 = point["bbox"]
        box = (x1*sx, y1*sy, x2*sx, y2*sy)
        color = colors[index % len(colors)]
        draw.rectangle(box, outline=color, width=max(2, image.width // 240))
        draw.rectangle((box[0], max(0, box[1]-20), box[0]+92, box[1]), fill=color)
        draw.text((box[0]+4, max(1, box[1]-18)), f"TRACK {track.track_id}", fill="black")
    out = io.BytesIO(); image.save(out, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()


def parse(content, allowed_track_ids):
    raw = content.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.I)
    data = json.loads(raw)
    rows = data.get("suggestions")
    if not isinstance(rows, list):
        raise ValueError("suggestions must be an array")
    result = []
    seen = set()
    for row in rows:
        track_id = int(row.get("track_id"))
        if track_id not in allowed_track_ids or track_id in seen:
            raise ValueError("response contains an unexpected or duplicate track_id")
        object_type = str(row.get("object_type", "")).strip().lower()
        color = str(row.get("color", "")).strip().lower()
        if object_type not in ALLOWED_TYPES or color not in ALLOWED_COLORS:
            raise ValueError("response contains an unsupported type or colour")
        confidence = float(row.get("confidence"))
        if not 0 <= confidence <= 1:
            raise ValueError("confidence must be between 0 and 1")
        uncertainty = str(row.get("uncertainty", "")).strip()[:240]
        prefix = "Person" if object_type == "pedestrian" else "Vehicle"
        descriptor = " ".join(x for x in (color if color != "unknown" else "", object_type) if x).strip()
        result.append({"track_id":track_id, "label":f"{prefix} · {descriptor or 'unidentified road user'}",
                       "object_type":object_type, "color":color, "role":str(row.get("role", "")).strip()[:120],
                       "confidence":confidence, "uncertainty":uncertainty})
        seen.add(track_id)
    return result
