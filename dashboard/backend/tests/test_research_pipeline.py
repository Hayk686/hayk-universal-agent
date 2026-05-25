"""Tests for research pipeline stub, fallback, timeout, and verification."""

from __future__ import annotations

import asyncio

import pytest

from app.research.models import Citation, ResearchQuery, SourceTier
from app.research.pipeline import (
    HttpResearchPipeline,
    ResearchPolicyError,
    SearchHit,
    StubResearchPipeline,
    clear_result_cache,
    ensure_research_policy_allowed,
    get_cached_result,
)
from app.policy.confirmation import issue_confirmation_token
from app.research.source_quality import simplify_query


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    clear_result_cache()
    yield
    clear_result_cache()


def test_stub_pipeline_returns_citations(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("POLICY_CONFIRM_SECRET", "test-secret")
    pipeline = StubResearchPipeline()

    async def _run():
        token = issue_confirmation_token("network research query")
        return await pipeline.run(
            ResearchQuery(query="Hayk agent architecture"),
            run_id="run-stub",
            confirmation_token=token,
        )

    result = asyncio.run(_run())
    assert result.query_id
    assert len(result.citations) >= 1
    assert result.citations[0].source_tier == SourceTier.PRIMARY
    assert "Found" in result.summary
    assert get_cached_result(result.query_id) is not None


def test_stub_pipeline_fallback_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("POLICY_CONFIRM_SECRET", "test-secret")
    pipeline = StubResearchPipeline(fallback_on_query="trigger-fallback")

    async def _run():
        token = issue_confirmation_token("network research query")
        return await pipeline.run(
            ResearchQuery(query="trigger-fallback query"),
            run_id="run-fb",
            confirmation_token=token,
        )

    result = asyncio.run(_run())
    assert result.fallback_used is True
    assert any("fallback" in w.lower() for w in result.warnings)


def test_http_pipeline_fallback_when_sparse(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("POLICY_CONFIRM_SECRET", "test-secret")
    calls: list[str] = []

    async def fake_search(query: str, *, max_results: int, timeout: float) -> list[SearchHit]:
        calls.append(query)
        if query == simplify_query("long research query with many extra words"):
            return [
                SearchHit(
                    url="https://www.example.gov/doc",
                    title="Gov Doc",
                    snippet="info",
                )
            ]
        return []

    async def fake_verify(url: str, *, timeout: float) -> tuple[bool, str, int | None]:
        return True, "", 200

    pipeline = HttpResearchPipeline(
        search_fetcher=fake_search,
        url_verifier=fake_verify,
        min_results=2,
    )

    async def _run():
        return await pipeline.run(
            ResearchQuery(
                query="long research query with many extra words",
                require_verification=True,
            ),
            run_id="run-http",
            skip_policy=True,
        )

    result = asyncio.run(_run())
    assert result.fallback_used is True
    assert len(calls) >= 2
    assert len(result.citations) >= 1


def test_http_pipeline_timeout_warning(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx

    async def timeout_search(query: str, *, max_results: int, timeout: float) -> list[SearchHit]:
        raise httpx.TimeoutException("timed out")

    pipeline = HttpResearchPipeline(search_fetcher=timeout_search, min_results=1)

    async def _run():
        return await pipeline.run(
            ResearchQuery(query="timeout test"),
            run_id="run-timeout",
            skip_policy=True,
        )

    result = asyncio.run(_run())
    assert result.citations == []
    assert any("timed out" in w.lower() for w in result.warnings)


def test_verification_marks_citations(monkeypatch: pytest.MonkeyPatch) -> None:
    async def one_hit(query: str, *, max_results: int, timeout: float) -> list[SearchHit]:
        return [SearchHit(url="https://example.edu/paper", title="Paper", snippet="")]

    async def verify_ok(url: str, *, timeout: float) -> tuple[bool, str, int | None]:
        return True, "ok", 200

    pipeline = HttpResearchPipeline(search_fetcher=one_hit, url_verifier=verify_ok, min_results=1)

    async def _run():
        return await pipeline.run(
            ResearchQuery(query="verify me", require_verification=True),
            run_id="run-verify",
            skip_policy=True,
        )

    result = asyncio.run(_run())
    assert result.citations[0].verified is True


def test_gated_verification_adds_warning(monkeypatch: pytest.MonkeyPatch) -> None:
    async def one_hit(query: str, *, max_results: int, timeout: float) -> list[SearchHit]:
        return [SearchHit(url="https://news.example.com/story", title="Story", snippet="")]

    async def verify_gated(url: str, *, timeout: float) -> tuple[bool, str, int | None]:
        return False, "Subscribe to read the full article.", 200

    pipeline = HttpResearchPipeline(search_fetcher=one_hit, url_verifier=verify_gated, min_results=1)

    async def _run():
        return await pipeline.run(
            ResearchQuery(query="gated story", require_verification=True),
            run_id="run-gated",
            skip_policy=True,
        )

    result = asyncio.run(_run())
    assert result.citations[0].verified is False
    assert result.gated_sites
    assert any("gated" in w.lower() for w in result.warnings)


def test_policy_requires_confirmation_without_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("POLICY_CONFIRM_SECRET", "test-secret")
    with pytest.raises(ResearchPolicyError):
        ensure_research_policy_allowed(
            confirmation_token=None,
            run_id="run-policy",
            query_text="network search",
        )
