"""Source tier heuristics and gated-site detection aligned with Hermes URL policy."""

from __future__ import annotations

import fnmatch
import ipaddress
import re
from urllib.parse import urlparse

from app.research.models import GatedReason, GatedSiteInfo, SourceTier

# Hostnames always blocked (url_safety.py floor)
_BLOCKED_HOSTNAMES = frozenset(
    {
        "metadata.google.internal",
        "metadata.goog",
    }
)

_ALWAYS_BLOCKED_IPS = frozenset(
    {
        ipaddress.ip_address("169.254.169.254"),
        ipaddress.ip_address("169.254.170.2"),
        ipaddress.ip_address("169.254.169.253"),
    }
)

# Optional local blocklist patterns (website_policy-style); env can extend
_DEFAULT_BLOCKLIST_PATTERNS: tuple[str, ...] = (
    "facebook.com",
    "twitter.com",
    "x.com",
)

_PAYWALL_KEYWORDS: tuple[str, ...] = (
    "paywall",
    "subscribe to read",
    "subscription required",
    "premium content",
    "members only",
)

_LOGIN_KEYWORDS: tuple[str, ...] = (
    "sign in to continue",
    "log in to continue",
    "login required",
    "authentication required",
    "please log in",
)

_CAPTCHA_KEYWORDS: tuple[str, ...] = (
    "captcha",
    "verify you are human",
    "recaptcha",
    "hcaptcha",
)

_GOV_SUFFIXES = (".gov", ".gov.uk", ".gov.au", ".gouv.fr")
_EDU_SUFFIXES = (".edu", ".ac.uk", ".edu.au")
_NEWS_HINTS = (
    "news.",
    "reuters.com",
    "bbc.com",
    "bbc.co.uk",
    "nytimes.com",
    "theguardian.com",
    "apnews.com",
    "cnn.com",
)


def extract_domain(url: str) -> str:
    parsed = urlparse(url)
    host = (parsed.hostname or parsed.netloc or "").strip().lower().rstrip(".")
    if host.startswith("www."):
        host = host[4:]
    return host


def classify_source_tier(url: str) -> SourceTier:
    """Heuristic tier: gov/edu → primary, news → secondary, else unknown."""
    domain = extract_domain(url)
    if not domain:
        return SourceTier.UNKNOWN
    if domain.endswith(_GOV_SUFFIXES) or ".gov." in domain:
        return SourceTier.PRIMARY
    if domain.endswith(_EDU_SUFFIXES) or ".edu." in domain:
        return SourceTier.PRIMARY
    for hint in _NEWS_HINTS:
        if hint in domain:
            return SourceTier.SECONDARY
    return SourceTier.UNKNOWN


def _host_matches_blocklist(domain: str, pattern: str) -> bool:
    if pattern.startswith("*."):
        return fnmatch.fnmatch(domain, pattern)
    return domain == pattern or domain.endswith(f".{pattern}")


def check_url_blocked(url: str, extra_patterns: tuple[str, ...] = ()) -> GatedSiteInfo | None:
    """Return GatedSiteInfo when URL should not be fetched (SSRF floor + blocklist)."""
    domain = extract_domain(url)
    if not domain:
        return GatedSiteInfo(domain="", reason=GatedReason.BLOCKED)

    if domain in _BLOCKED_HOSTNAMES:
        return GatedSiteInfo(domain=domain, reason=GatedReason.BLOCKED)

    try:
        ip = ipaddress.ip_address(domain)
        if ip in _ALWAYS_BLOCKED_IPS or ip.is_private or ip.is_loopback:
            return GatedSiteInfo(domain=domain, reason=GatedReason.BLOCKED)
    except ValueError:
        pass

    patterns = _DEFAULT_BLOCKLIST_PATTERNS + extra_patterns
    for pattern in patterns:
        if _host_matches_blocklist(domain, pattern):
            return GatedSiteInfo(domain=domain, reason=GatedReason.BLOCKED)
    return None


def detect_gated_from_url(url: str) -> GatedSiteInfo | None:
    """Detect likely gated destinations from URL path/host hints."""
    blocked = check_url_blocked(url)
    if blocked is not None:
        return blocked
    domain = extract_domain(url)
    lowered = url.lower()
    if any(k in lowered for k in ("login", "signin", "auth", "sso")):
        return GatedSiteInfo(domain=domain, reason=GatedReason.LOGIN)
    if "captcha" in lowered:
        return GatedSiteInfo(domain=domain, reason=GatedReason.CAPTCHA)
    return None


def detect_gated_from_response(
    *,
    url: str,
    status_code: int,
    body_text: str = "",
) -> GatedSiteInfo | None:
    """Detect paywall/login/captcha from HTTP response hints."""
    domain = extract_domain(url)
    if status_code in (401, 403):
        return GatedSiteInfo(domain=domain, reason=GatedReason.LOGIN)
    if status_code == 429:
        return GatedSiteInfo(domain=domain, reason=GatedReason.CAPTCHA)
    if not body_text:
        return None
    sample = body_text[:8000].lower()
    if any(k in sample for k in _CAPTCHA_KEYWORDS):
        return GatedSiteInfo(domain=domain, reason=GatedReason.CAPTCHA)
    if any(k in sample for k in _LOGIN_KEYWORDS):
        return GatedSiteInfo(domain=domain, reason=GatedReason.LOGIN)
    if any(k in sample for k in _PAYWALL_KEYWORDS):
        return GatedSiteInfo(domain=domain, reason=GatedReason.PAYWALL)
    return None


def simplify_query(query: str, *, max_words: int = 4) -> str:
    """Fallback strategy: shorten query to core keywords."""
    words = re.findall(r"\w+", query.strip())
    if len(words) <= max_words:
        return query.strip()
    return " ".join(words[:max_words])
