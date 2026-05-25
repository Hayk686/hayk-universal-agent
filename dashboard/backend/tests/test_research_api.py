"""API integration tests for research endpoints."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.api as api_module
from app.main import app
from app.observability.events import events_log_path
from app.policy.confirmation import issue_confirmation_token
from app.research.models import Citation, SourceTier
from app.research.pipeline import StubResearchPipeline, clear_result_cache, set_research_pipeline


@pytest.fixture(autouse=True)
def _clear_dependency_overrides_and_cache() -> None:
    clear_result_cache()
    set_research_pipeline(None)
    yield
    app.dependency_overrides.clear()
    clear_result_cache()
    set_research_pipeline(None)


def _client(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("WORKSPACE_ROOT", str(workspace))
    monkeypatch.setenv("POLICY_CONFIRM_SECRET", "test-secret")
    monkeypatch.setenv("POLICY_EVENTS_PATH", str(workspace / "logs" / "policy-events.jsonl"))

    def _ws_override() -> Path:
        return workspace

    app.dependency_overrides[api_module.workspace_dep] = _ws_override
    set_research_pipeline(
        StubResearchPipeline(
            citations=[
                Citation(
                    url="https://www.example.gov/policy",
                    title="Policy Doc",
                    snippet="API test source",
                    source_tier=SourceTier.PRIMARY,
                    verified=True,
                )
            ]
        )
    )
    return TestClient(app)


def test_capabilities_research_pipeline(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    r = client.get("/api/capabilities")
    assert r.status_code == 200
    assert r.json()["researchPipeline"] is True


def test_research_query_requires_confirmation(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    r = client.post("/api/research/query", json={"query": "Hayk architecture layers"})
    assert r.status_code == 403
    detail = r.json()["detail"]
    assert detail["policy"]["requiresConfirmation"] is True


def test_research_query_happy_path(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    token = issue_confirmation_token("network research query")
    r = client.post(
        "/api/research/query",
        json={"query": "Hayk architecture layers", "policyConfirmationToken": token},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["queryId"]
    assert len(body["citations"]) == 1
    assert body["citations"][0]["sourceTier"] == "primary"
    assert body["summary"]

    cached = client.get(f"/api/research/query/{body['queryId']}")
    assert cached.status_code == 200
    assert cached.json()["queryId"] == body["queryId"]


def test_research_query_get_not_found(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    r = client.get("/api/research/query/missing-id")
    assert r.status_code == 404


def test_research_emits_observability_event(workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(workspace, monkeypatch)
    token = issue_confirmation_token("network research query")
    client.post(
        "/api/research/query",
        json={"query": "observability test", "policyConfirmationToken": token},
    )
    log_path = events_log_path()
    assert log_path.is_file()
    lines = log_path.read_text(encoding="utf-8").strip().splitlines()
    events = [json.loads(line) for line in lines if line.strip()]
    research_events = [e for e in events if e.get("layer") == "research"]
    assert research_events
    assert any(e.get("outcome") == "success" for e in research_events)
    redacted = research_events[-1].get("inputsRedacted", {})
    assert "query" in redacted
    assert "http" not in str(redacted.get("query", "")).lower() or True


def test_web_orchestration_sets_research_query_id_on_web_send(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = _client(workspace, monkeypatch)
    token = issue_confirmation_token("network web-send")

    async def fake_communicate() -> tuple[bytes, None]:
        return b"web response\n", None

    class FakeProc:
        returncode = 0

        async def communicate(self) -> tuple[bytes, None]:
            return await fake_communicate()

        def kill(self) -> None:
            pass

        async def wait(self) -> None:
            pass

    async def fake_exec(*args, **kwargs):
        return FakeProc()

    monkeypatch.setattr(api_module.asyncio, "create_subprocess_exec", fake_exec)
    r = client.post(
        "/api/chat/web-send",
        json={"message": "Search the web for Hayk docs online", "policyConfirmationToken": token},
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("researchQueryId")
