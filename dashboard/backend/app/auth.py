"""
Optional authentication hook for future use.

MVP: no verification. When adding auth, implement ``verify_request`` and attach it
as a FastAPI dependency on protected routes.
"""

from typing import Annotated

import os
from fastapi import Header, HTTPException


async def verify_request(
    x_dashboard_key: Annotated[str | None, Header(alias="X-Dashboard-Key")] = None,
) -> None:
    expected = os.environ.get("DASHBOARD_API_KEY")
    if not expected:
        return
    if x_dashboard_key != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")
