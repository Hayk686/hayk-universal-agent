"""Research pipeline adapters with PolicyGate-gated network calls."""

from __future__ import annotations

import re
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Protocol
from urllib.parse import unquote

import httpx

from app.observability.events import emit_event
from app.policy.confirmation import verify_confirmation_token
from app.policy.gate import PolicyDecision, classify_action
from app.research.models import (
    Citation,
    GatedSiteInfo,
    ResearchQuery,
    ResearchResult,
    SourceTier,
)
from app.research.source_quality import (
    check_url_blocked,
    classify_source_tier,
    detect_gated_from_response,
    detect_gated_from_url,
    extract_domain,
    simplify_query,
)

RESEARCH_POLICY_ACTION = "network research query"
MIN_RESULTS_BEFORE_FALLBACK = 2

_RESULT_CACHE: dict[str, ResearchResult] = {}


class ResearchPolicyError(PermissionError):
    """Raised when PolicyGate denies a research network action."""


@dataclass(frozen=True)
class SearchHit:
    url: str
    title: str
    snippet: str


class SearchFetcher(Protocol):
    async def search(self, query: str, *, max_results: int, timeout: float) -> list[SearchHit]: ...


class UrlVerifier(Protocol):
    async def verify(self, url: str, *, timeout: float) -> tuple[bool, str, int | None]: ...


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _emit_research_event(
    *,
    run_id: str,
    decision: str,
    reason: str,
    query_text: str,
    outcome: str,
    extra: dict[str, Any] | None = None,
) -> None:
    emit_event(
        run_id=run_id,
        layer="research",
        decision=decision,
        reason=reason,
        inputs_redacted={"query": query_text[:200], **(extra or {})},
        outcome=outcome,
    )


def ensure_research_policy_allowed(
    *,
    confirmation_token: str | None,
    run_id: str,
    query_text: str,
) -> PolicyDecision:
    """Classify and enforce PolicyGate for research network actions."""
    decision = classify_action(
        RESEARCH_POLICY_ACTION,
        context={"kind": "network", "endpoint": "/api/research/query"},
    )
    _emit_research_event(
        run_id=run_id,
        decision="allow" if decision.allowed else ("confirm" if decision.requires_confirmation else "deny"),
        reason=decision.reason,
        query_text=query_text,
        outcome="policy_classified",
    )
    if decision.allowed:
        return decision
    if decision.requires_confirmation and confirmation_token:
        ok, reason = verify_confirmation_token(confirmation_token, RESEARCH_POLICY_ACTION)
        if ok:
            _emit_research_event(
                run_id=run_id,
                decision="allow",
                reason="confirmation token accepted",
                query_text=query_text,
                outcome="policy_confirmed",
            )
            return PolicyDecision(
                allowed=True,
                risk=decision.risk,
                requires_confirmation=False,
                reason="confirmation token accepted",
                confirmation_token=None,
            )
        _emit_research_event(
            run_id=run_id,
            decision="confirm",
            reason=reason,
            query_text=query_text,
            outcome="confirm_failed",
        )
        raise ResearchPolicyError(reason)
    _emit_research_event(
        run_id=run_id,
        decision="confirm" if decision.requires_confirmation else "deny",
        reason=decision.reason,
        query_text=query_text,
        outcome="policy_denied",
    )
    raise ResearchPolicyError(decision.reason)


def build_summary(citations: list[Citation], query: str) -> str:
    """Deterministic heuristic summary for MVP."""
    if not citations:
        return f"No sources found for: {query.strip()[:120]}"
    verified = sum(1 for c in citations if c.verified)
    tiers = {c.source_tier.value for c in citations}
    tier_note = ", ".join(sorted(tiers))
    top = citations[0]
    title = top.title or extract_domain(top.url)
    return (
        f"Found {len(citations)} source(s) ({verified} verified). "
        f"Tiers: {tier_note}. Top: {title}."
    )


def cache_result(result: ResearchResult) -> None:
    _RESULT_CACHE[result.query_id] = result


def get_cached_result(query_id: str) -> ResearchResult | None:
    return _RESULT_CACHE.get(query_id)


def clear_result_cache() -> None:
    """Test helper."""
    _RESULT_CACHE.clear()


class ResearchPipeline(ABC):
    @abstractmethod
    async def run(
        self,
        query: ResearchQuery,
        *,
        run_id: str = "",
        confirmation_token: str | None = None,
        skip_policy: bool = False,
    ) -> ResearchResult: ...


class StubResearchPipeline(ResearchPipeline):
    """Canned results for tests and offline development."""

    def __init__(
        self,
        *,
        citations: list[Citation] | None = None,
        fallback_on_query: str | None = None,
    ) -> None:
        self._citations = citations or [
            Citation(
                url="https://www.example.gov/report",
                title="Example Gov Report",
                snippet="Primary source snippet.",
                source_tier=SourceTier.PRIMARY,
                verified=True,
            ),
            Citation(
                url="https://news.example.com/article",
                title="Example News",
                snippet="Secondary coverage.",
                source_tier=SourceTier.SECONDARY,
                verified=True,
            ),
        ]
        self._fallback_on_query = fallback_on_query

    async def run(
        self,
        query: ResearchQuery,
        *,
        run_id: str = "",
        confirmation_token: str | None = None,
        skip_policy: bool = False,
    ) -> ResearchResult:
        if not skip_policy:
            ensure_research_policy_allowed(
                confirmation_token=confirmation_token,
                run_id=run_id,
                query_text=query.query,
            )
        query_id = str(uuid.uuid4())
        fallback_used = False
        citations = list(self._citations)
        warnings: list[str] = []
        if self._fallback_on_query and self._fallback_on_query in query.query:
            fallback_used = True
            warnings.append("Stub fallback path activated")
            _emit_research_event(
                run_id=run_id,
                decision="fallback",
                reason="stub fallback",
                query_text=query.query,
                outcome="warning",
            )
        result = ResearchResult(
            query_id=query_id,
            citations=citations[: query.max_results],
            summary=build_summary(citations[: query.max_results], query.query),
            warnings=warnings,
            fallback_used=fallback_used,
        )
        cache_result(result)
        _emit_research_event(
            run_id=run_id,
            decision="query_complete",
            reason=f"{len(result.citations)} citations",
            query_text=query.query,
            outcome="success",
            extra={"queryId": query_id, "fallbackUsed": fallback_used},
        )
        return result


_DDG_LINK_RE = re.compile(r'uddg=([^&"]+)')


async def default_ddg_search(query: str, *, max_results: int, timeout: float) -> list[SearchHit]:
    """Primary search via DuckDuckGo HTML (httpx)."""
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        resp = await client.post(
            "https://html.duckduckgo.com/html/",
            data={"q": query},
            headers={"User-Agent": "HaykResearchPipeline/1.0"},
        )
        resp.raise_for_status()
        text = resp.text
    hits: list[SearchHit] = []
    seen: set[str] = set()
    for match in _DDG_LINK_RE.finditer(text):
        raw_url = unquote(match.group(1))
        if raw_url in seen:
            continue
        seen.add(raw_url)
        gated = detect_gated_from_url(raw_url)
        if gated is not None:
            continue
        hits.append(
            SearchHit(
                url=raw_url,
                title=extract_domain(raw_url),
                snippet="",
            )
        )
        if len(hits) >= max_results:
            break
    return hits


async def default_url_verifier(
    url: str, *, timeout: float
) -> tuple[bool, str, int | None]:
    """MVP verification: HEAD then GET with timeout."""
    blocked = check_url_blocked(url)
    if blocked is not None:
        return False, "", None
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.head(url)
            if resp.status_code >= 400:
                resp = await client.get(url)
            body = resp.text[:8000] if resp.status_code < 500 else ""
            gated = detect_gated_from_response(
                url=url, status_code=resp.status_code, body_text=body
            )
            if gated is not None:
                return False, body, resp.status_code
            return resp.status_code < 400, body, resp.status_code
    except (httpx.TimeoutException, httpx.HTTPError):
        return False, "", None


class HttpResearchPipeline(ResearchPipeline):
    """MVP pipeline: httpx search + fallback simplified query + URL verification."""

    def __init__(
        self,
        *,
        search_fetcher: SearchFetcher | None = None,
        url_verifier: UrlVerifier | None = None,
        min_results: int = MIN_RESULTS_BEFORE_FALLBACK,
    ) -> None:
        self._search = search_fetcher or default_ddg_search
        self._verify = url_verifier or default_url_verifier
        self._min_results = min_results

    async def run(
        self,
        query: ResearchQuery,
        *,
        run_id: str = "",
        confirmation_token: str | None = None,
        skip_policy: bool = False,
    ) -> ResearchResult:
        if not skip_policy:
            ensure_research_policy_allowed(
                confirmation_token=confirmation_token,
                run_id=run_id,
                query_text=query.query,
            )

        query_id = str(uuid.uuid4())
        warnings: list[str] = []
        gated_sites: list[GatedSiteInfo] = []
        fallback_used = False
        timeout = query.timeout_seconds

        citations = await self._search_with_gating(
            query.query,
            max_results=query.max_results,
            timeout=timeout,
            warnings=warnings,
            gated_sites=gated_sites,
        )

        # Attempt 2: fallback with simplified query when primary is sparse or failed
        if len(citations) < self._min_results:
            simplified = simplify_query(query.query)
            if simplified != query.query.strip():
                fallback_used = True
                _emit_research_event(
                    run_id=run_id,
                    decision="fallback",
                    reason="primary search returned insufficient results",
                    query_text=query.query,
                    outcome="warning",
                    extra={"fallbackQuery": simplified[:120]},
                )
                warnings.append(f"Fallback search used with simplified query: {simplified}")
                extra = await self._search_with_gating(
                    simplified,
                    max_results=query.max_results,
                    timeout=timeout,
                    warnings=warnings,
                    gated_sites=gated_sites,
                )
                seen = {c.url for c in citations}
                for c in extra:
                    if c.url not in seen:
                        citations.append(c)
                        seen.add(c.url)

        if query.require_verification:
            for citation in citations:
                ok, body, status = await self._verify(citation.url, timeout=timeout)
                citation.verified = ok
                if not ok and body:
                    gated = detect_gated_from_response(
                        url=citation.url,
                        status_code=status or 403,
                        body_text=body,
                    )
                    if gated is not None:
                        gated_sites.append(gated)
                        warnings.append(
                            f"Gated site detected ({gated.reason.value}): {gated.domain}"
                        )

        for citation in citations:
            citation.source_tier = classify_source_tier(citation.url)

        result = ResearchResult(
            query_id=query_id,
            citations=citations[: query.max_results],
            summary=build_summary(citations[: query.max_results], query.query),
            warnings=warnings,
            fallback_used=fallback_used,
            gated_sites=gated_sites,
        )
        cache_result(result)
        _emit_research_event(
            run_id=run_id,
            decision="query_complete",
            reason=f"{len(result.citations)} citations",
            query_text=query.query,
            outcome="success" if result.citations else "empty",
            extra={
                "queryId": query_id,
                "fallbackUsed": fallback_used,
                "citationCount": len(result.citations),
            },
        )
        return result

    async def _search_with_gating(
        self,
        query_text: str,
        *,
        max_results: int,
        timeout: float,
        warnings: list[str],
        gated_sites: list[GatedSiteInfo],
    ) -> list[Citation]:
        try:
            hits = await self._search(query_text, max_results=max_results, timeout=timeout)
        except httpx.TimeoutException:
            warnings.append("Search timed out")
            _emit_research_event(
                run_id="",
                decision="search",
                reason="timeout",
                query_text=query_text,
                outcome="failed",
            )
            return []
        except httpx.HTTPError as exc:
            warnings.append(f"Search error: {exc}")
            _emit_research_event(
                run_id="",
                decision="search",
                reason=str(exc)[:200],
                query_text=query_text,
                outcome="failed",
            )
            return []

        citations: list[Citation] = []
        for hit in hits:
            gated = detect_gated_from_url(hit.url)
            if gated is not None:
                gated_sites.append(gated)
                warnings.append(f"Skipped gated/blocked URL: {gated.domain} ({gated.reason.value})")
                continue
            citations.append(
                Citation(
                    url=hit.url,
                    title=hit.title,
                    snippet=hit.snippet,
                    fetched_at=_utc_now(),
                    source_tier=classify_source_tier(hit.url),
                    verified=False,
                )
            )
        return citations


_default_pipeline: ResearchPipeline | None = None


def get_research_pipeline() -> ResearchPipeline:
    global _default_pipeline
    if _default_pipeline is None:
        _default_pipeline = HttpResearchPipeline()
    return _default_pipeline


def set_research_pipeline(pipeline: ResearchPipeline | None) -> None:
    """Override pipeline (tests)."""
    global _default_pipeline
    _default_pipeline = pipeline
