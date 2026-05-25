"""Pydantic models for the research reliability pipeline."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SourceTier(str, Enum):
    PRIMARY = "primary"
    SECONDARY = "secondary"
    UNKNOWN = "unknown"


class GatedReason(str, Enum):
    PAYWALL = "paywall"
    LOGIN = "login"
    CAPTCHA = "captcha"
    BLOCKED = "blocked"


class Citation(BaseModel):
    url: str
    title: str = ""
    snippet: str = ""
    fetched_at: str = Field(default_factory=_utc_now)
    source_tier: SourceTier = SourceTier.UNKNOWN
    verified: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "title": self.title,
            "snippet": self.snippet,
            "fetchedAt": self.fetched_at,
            "sourceTier": self.source_tier.value,
            "verified": self.verified,
        }


class ResearchQuery(BaseModel):
    query: str = Field(..., description="Search query text")
    max_results: int = Field(default=5, ge=1, le=20)
    timeout_seconds: float = Field(default=15.0, ge=1.0, le=120.0)
    require_verification: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "query": self.query,
            "maxResults": self.max_results,
            "timeoutSeconds": self.timeout_seconds,
            "requireVerification": self.require_verification,
        }


class GatedSiteInfo(BaseModel):
    domain: str
    reason: GatedReason

    def to_dict(self) -> dict[str, Any]:
        return {"domain": self.domain, "reason": self.reason.value}


class ResearchResult(BaseModel):
    query_id: str
    citations: list[Citation] = Field(default_factory=list)
    summary: str = ""
    warnings: list[str] = Field(default_factory=list)
    fallback_used: bool = False
    gated_sites: list[GatedSiteInfo] = Field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "queryId": self.query_id,
            "citations": [c.to_dict() for c in self.citations],
            "summary": self.summary,
            "warnings": self.warnings,
            "fallbackUsed": self.fallback_used,
            "gatedSites": [g.to_dict() for g in self.gated_sites],
        }
