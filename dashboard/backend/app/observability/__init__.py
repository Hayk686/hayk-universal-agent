"""Structured observability for Hayk dashboard policy decisions."""

from app.observability.events import emit_event, events_log_path

__all__ = ["emit_event", "events_log_path"]
