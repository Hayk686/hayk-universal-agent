import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import router as api_router
from app.middleware.policy_observability import PolicyObservabilityMiddleware

app = FastAPI(title="Hayk Universal Agent Dashboard API", version="0.1.0")
app.add_middleware(PolicyObservabilityMiddleware)


@app.exception_handler(PermissionError)
async def permission_denied(_request: Request, _exc: PermissionError) -> JSONResponse:
    return JSONResponse(status_code=403, content={"detail": "Forbidden"})

_origins = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:5174,http://127.0.0.1:5174,"
    "http://localhost:5175,http://127.0.0.1:5175",
)
origins = [o.strip() for o in _origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
