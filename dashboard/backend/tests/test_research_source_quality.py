"""Tests for research source tier and gated-site detection."""

from __future__ import annotations

from app.research.models import GatedReason, SourceTier
from app.research.source_quality import (
    check_url_blocked,
    classify_source_tier,
    detect_gated_from_response,
    detect_gated_from_url,
    simplify_query,
)


def test_classify_gov_as_primary() -> None:
    assert classify_source_tier("https://www.nasa.gov/mission") == SourceTier.PRIMARY


def test_classify_edu_as_primary() -> None:
    assert classify_source_tier("https://web.mit.edu/course") == SourceTier.PRIMARY


def test_classify_news_as_secondary() -> None:
    assert classify_source_tier("https://www.reuters.com/world") == SourceTier.SECONDARY


def test_classify_unknown_domain() -> None:
    assert classify_source_tier("https://random-blog.example.net/post") == SourceTier.UNKNOWN


def test_detect_gated_login_from_url() -> None:
    info = detect_gated_from_url("https://example.com/login?next=/article")
    assert info is not None
    assert info.reason == GatedReason.LOGIN
    assert info.domain == "example.com"


def test_detect_gated_paywall_from_response() -> None:
    info = detect_gated_from_response(
        url="https://news.example.com/story",
        status_code=200,
        body_text="This is premium content. Subscribe to read the full article.",
    )
    assert info is not None
    assert info.reason == GatedReason.PAYWALL


def test_detect_gated_captcha_from_response() -> None:
    info = detect_gated_from_response(
        url="https://site.example.com/",
        status_code=429,
        body_text="",
    )
    assert info is not None
    assert info.reason == GatedReason.CAPTCHA


def test_block_metadata_hostname() -> None:
    info = check_url_blocked("https://metadata.google.internal/computeMetadata/v1/")
    assert info is not None
    assert info.reason == GatedReason.BLOCKED


def test_simplify_query_truncates_words() -> None:
    assert simplify_query("research competitors pricing online today", max_words=3) == "research competitors pricing"
