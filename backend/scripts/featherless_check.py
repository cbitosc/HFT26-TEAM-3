"""Live checks for the Featherless API (MODEL_SELECTION §8).

    python scripts/featherless_check.py

Reads FEATHERLESS_* settings from the repo-root .env / environment. Without a key it runs only the public
catalogue check and exits with status 2. The key is never printed or written. Results go to
research/featherless_check/report.json.
"""
import base64
import json
import re
import struct
import sys
import time
import zlib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import httpx
from pydantic import BaseModel, ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import REPO_ROOT, get_settings  # noqa: E402

STATEMENT = "I saw the blue car turn left just before the collision. The other vehicle was moving very fast."


class ClaimOut(BaseModel):
    subject: str
    action: str
    direction: str | None = None
    time_description: str | None = None
    source_text: str


class ClaimList(BaseModel):
    claims: list[ClaimOut]


TEXT_PROMPT = (
    "Extract witness claims from the statement. Reply with JSON only, matching exactly this shape: "
    '{"claims":[{"subject":str,"action":str,"direction":str|null,"time_description":str|null,"source_text":str}]}. '
    "source_text must be copied word for word from the statement. Use null for anything not stated. "
    f"Statement: {STATEMENT}"
)


def make_png(size: int = 128) -> bytes:
    """White image with a red square in the centre, encoded with the standard library only."""
    rows = []
    lo, hi = size // 4, 3 * size // 4
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            row += bytes((255, 0, 0)) if lo <= x < hi and lo <= y < hi else bytes((255, 255, 255))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


def call(client: httpx.Client, base: str, key: str, body: dict) -> dict:
    t0 = time.perf_counter()
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json", "HTTP-Referer": "https://github.com/", "X-Title": "TraceLine"}
    try:
        r = client.post(f"{base}/chat/completions", json=body, headers=headers, timeout=120)
        ms = int((time.perf_counter() - t0) * 1000)
        out = {"status": r.status_code, "latency_ms": ms}
        try:
            data = r.json()
        except ValueError:
            return out | {"error": r.text[:200]}
        if r.status_code == 200:
            msg = data["choices"][0]["message"].get("content") or ""
            usage = data.get("usage", {})
            return out | {"content": msg, "tokens_in": usage.get("prompt_tokens"), "tokens_out": usage.get("completion_tokens")}
        return out | {"error": json.dumps(data)[:300]}
    except httpx.HTTPError as exc:
        return {"status": None, "error": type(exc).__name__, "latency_ms": int((time.perf_counter() - t0) * 1000)}


def parse_claims(content: str) -> dict:
    think = "<think>" in content
    cleaned = re.sub(r"<think>.*?</think>", "", content, flags=re.S).strip()
    cleaned = re.sub(r"^```(?:json)?|```$", "", cleaned.strip(), flags=re.M).strip()
    try:
        parsed = ClaimList.model_validate_json(cleaned)
    except (ValidationError, ValueError) as exc:
        return {"json_valid": False, "think_tags": think, "error": str(exc)[:160]}
    verbatim = all(c.source_text in STATEMENT for c in parsed.claims)
    return {"json_valid": True, "think_tags": think, "n_claims": len(parsed.claims), "all_spans_verbatim": verbatim}


def main() -> int:
    s = get_settings()
    base = s.featherless_base_url.rstrip("/")
    report: dict = {"run_at": datetime.now(timezone.utc).isoformat(), "base_url": base, "models": {}, "checks": {}}
    with httpx.Client() as client:
        # public catalogue
        try:
            cat = client.get(f"{base}/models", timeout=60).json()["data"]
            by_id = {m["id"]: m for m in cat}
            for role, mid in (("text", s.featherless_text_model), ("vision", s.featherless_vision_model)):
                m = by_id.get(mid)
                report["models"][role] = (
                    {"id": mid, "listed": True, "concurrency_cost": m["concurrency_cost"], "gated": m["is_gated"], "context": m["context_length"],
                     "price_in_per_mtok": float(m["pricing"]["prompt"]) * 1e6, "price_out_per_mtok": float(m["pricing"]["completion"]) * 1e6}
                    if m else {"id": mid, "listed": False}
                )
        except Exception as exc:  # noqa: BLE001
            report["models"]["error"] = type(exc).__name__

        if not s.featherless_configured:
            report["checks"] = {"skipped": "FEATHERLESS_API_KEY is not set; live checks need it"}
            _write(report)
            print("Catalogue:", json.dumps(report["models"], indent=2))
            print("\nLive checks skipped: set FEATHERLESS_API_KEY in your own terminal or .env, then rerun.")
            return 2

        key = s.featherless_api_key.get_secret_value()  # type: ignore[union-attr]
        text_body = {"model": s.featherless_text_model, "temperature": 0, "max_tokens": 600, "messages": [{"role": "user", "content": TEXT_PROMPT}]}

        r1 = call(client, base, key, text_body)
        report["checks"]["text_plain"] = {k: v for k, v in r1.items() if k != "content"} | (parse_claims(r1["content"]) if "content" in r1 else {})

        r2 = call(client, base, key, text_body | {"response_format": {"type": "json_object"}})
        report["checks"]["text_json_object"] = {k: v for k, v in r2.items() if k != "content"} | (parse_claims(r2["content"]) if "content" in r2 else {})

        png = base64.b64encode(make_png()).decode()
        vbody = {"model": s.featherless_vision_model, "temperature": 0, "max_tokens": 80, "messages": [{"role": "user", "content": [
            {"type": "text", "text": "What colour is the square in the middle of this image? Answer with one word."},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{png}"}}]}]}
        r3 = call(client, base, key, vbody)
        answer = (r3.get("content") or "").lower()
        report["checks"]["vision_base64_png"] = {k: v for k, v in r3.items() if k != "content"} | {"answer_head": answer[:60], "says_red": "red" in answer}

        short = text_body | {"max_tokens": 60}
        with ThreadPoolExecutor(3) as pool:
            rs = list(pool.map(lambda _: call(client, base, key, short), range(3)))
        report["checks"]["parallel_3_requests"] = {"statuses": [r.get("status") for r in rs], "latency_ms": [r.get("latency_ms") for r in rs]}

    _write(report)
    print(json.dumps(report, indent=2))
    return 0


def _write(report: dict) -> None:
    out = REPO_ROOT / "research" / "featherless_check"
    out.mkdir(parents=True, exist_ok=True)
    (out / "report.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    raise SystemExit(main())
