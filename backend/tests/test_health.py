from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import Settings, get_settings
from app.main import app


def test_health_shape_and_no_secret_leak():
    secret = "sk-test-SUPERSECRET-123"

    def fake_settings() -> Settings:
        base = get_settings()
        return base.model_copy(update={"featherless_api_key": SecretStr(secret)})

    app.dependency_overrides[get_settings] = fake_settings
    try:
        body = TestClient(app).get("/api/v1/health")
    finally:
        app.dependency_overrides.clear()
    assert body.status_code == 200
    data = body.json()
    assert data["status"] in {"ok", "degraded"}
    assert data["database"]["ok"] is True
    assert data["storage"]["writable"] is True
    assert data["featherless"]["configured"] is True
    assert "SUPERSECRET" not in body.text  # the key value never appears in responses


def test_health_reports_unconfigured_key():
    def no_key() -> Settings:
        return get_settings().model_copy(update={"featherless_api_key": None})

    app.dependency_overrides[get_settings] = no_key
    try:
        data = TestClient(app).get("/api/v1/health").json()
    finally:
        app.dependency_overrides.clear()
    assert data["featherless"]["configured"] is False
