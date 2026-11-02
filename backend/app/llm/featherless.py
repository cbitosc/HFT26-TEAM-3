"""Featherless (OpenAI-compatible) chat client: policy gate, response cache, retries, and a ledger of every call.

The API key is read from settings and sent only in the Authorization header. It is never stored, logged, cached or returned.
"""
import hashlib
import json
import time
from dataclasses import dataclass

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Case, LlmCall

RETRY_STATUS = {429, 500, 502, 503, 504}


class PolicyBlocked(Exception):
    """The case does not allow sending content to an external inference service."""


class NotConfigured(Exception):
    """No API key is configured."""


class LlmError(Exception):
    pass


@dataclass
class ChatResult:
    content: str
    tokens_in: int | None
    tokens_out: int | None
    latency_ms: int
    cached: bool
    call_id: int


def _h(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


class FeatherlessClient:
    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None, sleep=time.sleep, max_attempts: int = 3):
        self.settings = settings
        self.transport = transport
        self.sleep = sleep
        self.max_attempts = max_attempts

    def chat(self, session: Session, *, case: Case, model: str, messages: list[dict], purpose: str, input_ref: dict,
             model_run_id: str | None = None, response_format: dict | None = None, max_tokens: int = 1200,
             extra_body: dict | None = None) -> ChatResult:
        """One chat completion at temperature 0. Identical requests are served from the ledger instead of the network."""
        if not case.allow_external_inference:
            raise PolicyBlocked(f"case {case.code} does not allow external inference")
        if not self.settings.featherless_configured:
            raise NotConfigured("FEATHERLESS_API_KEY is not set")
        body = {"model": model, "messages": messages, "temperature": 0, "max_tokens": max_tokens}
        if response_format:
            body["response_format"] = response_format
        if extra_body:
            body.update(extra_body)
        prompt_hash = _h({"messages": messages, "response_format": response_format, "max_tokens": max_tokens, "extra_body": extra_body})
        input_hash = _h(input_ref)

        cached = session.execute(select(LlmCall).where(LlmCall.model == model, LlmCall.prompt_hash == prompt_hash, LlmCall.input_hash == input_hash,
                                                       LlmCall.error.is_(None), LlmCall.response.is_not(None),
                                                       LlmCall.valid.is_not(False))  # never replay an answer that failed validation
                                 .order_by(LlmCall.id.desc())).scalars().first()
        if cached is not None:
            return ChatResult(cached.response["content"], cached.tokens_in, cached.tokens_out, 0, True, cached.id)

        headers = {"Authorization": f"Bearer {self.settings.featherless_api_key.get_secret_value()}",  # type: ignore[union-attr]
                   "Content-Type": "application/json", "HTTP-Referer": "https://github.com/", "X-Title": "TraceLine"}
        url = self.settings.featherless_base_url.rstrip("/") + "/chat/completions"
        meta = {"purpose": purpose, "model": model, "response_format": response_format, "extra_body": extra_body, "input_ref": input_ref, "attempts": []}
        t0 = time.perf_counter()
        last_err = None
        # Do not inherit unrelated machine proxy variables; they can require optional SOCKS
        # dependencies and must never redirect evidence-bound API traffic.
        with httpx.Client(transport=self.transport, timeout=90, trust_env=False) as http:
            for attempt in range(1, self.max_attempts + 1):
                try:
                    r = http.post(url, json=body, headers=headers)
                except httpx.HTTPError as exc:
                    last_err = f"{type(exc).__name__}"
                    meta["attempts"].append({"attempt": attempt, "error": last_err})
                else:
                    meta["attempts"].append({"attempt": attempt, "status": r.status_code})
                    if r.status_code == 200:
                        data = r.json()
                        content = data["choices"][0]["message"].get("content") or ""
                        usage = data.get("usage") or {}
                        call = LlmCall(model_run_id=model_run_id, model=model, prompt_hash=prompt_hash, input_hash=input_hash, request_meta=meta,
                                       response={"content": content, "finish_reason": data["choices"][0].get("finish_reason")},
                                       tokens_in=usage.get("prompt_tokens"), tokens_out=usage.get("completion_tokens"),
                                       latency_ms=int((time.perf_counter() - t0) * 1000))
                        session.add(call)
                        session.flush()
                        return ChatResult(content, call.tokens_in, call.tokens_out, call.latency_ms, False, call.id)
                    last_err = f"HTTP {r.status_code}"
                    if r.status_code not in RETRY_STATUS:
                        break
                if attempt < self.max_attempts:
                    self.sleep(min(8.0, 0.5 * 2 ** (attempt - 1)))
        call = LlmCall(model_run_id=model_run_id, model=model, prompt_hash=prompt_hash, input_hash=input_hash, request_meta=meta,
                       response=None, latency_ms=int((time.perf_counter() - t0) * 1000), error=last_err)
        session.add(call)
        session.flush()
        raise LlmError(f"Featherless request failed: {last_err}")

    def record_validation(self, session: Session, call_id: int, valid: bool) -> None:
        call = session.get(LlmCall, call_id)
        if call is not None and call.valid is None:
            call.valid = valid


def make_client(settings: Settings) -> FeatherlessClient:
    """Single construction point (tests replace it with a client bound to a simulated transport)."""
    return FeatherlessClient(settings)
