import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from mcp_server.server import mcp


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage MCP session manager lifecycle."""
    async with mcp.session_manager.run():
        yield


app = FastAPI(title="Rialto API", lifespan=lifespan)

_allowed_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173",
).split(",")

_PUBLIC_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}


def _bearer_token(request: Request) -> str:
    header = request.headers.get("authorization", "")
    return header[7:].strip() if header.lower().startswith("bearer ") else ""


async def auth_dispatch(request: Request, call_next):
    """Authenticate every request. /mcp needs the dual credential; data routes need
    a valid user session. This app is also bound to localhost (see run())."""
    path = request.url.path
    if request.method == "OPTIONS" or path in _PUBLIC_PATHS:
        return await call_next(request)
    try:
        if path.startswith("/mcp"):
            request.state.user = verify_mcp_credentials(
                request.headers.get("x-internal-token"), _bearer_token(request)
            )
        else:
            token = _bearer_token(request)
            if not token:
                raise AuthError("Not authenticated.")
            request.state.user = require_active_user(token)
    except AuthError as exc:
        return JSONResponse(
            status_code=401,
            content={"error": exc.message, "code": "expired" if exc.expired else "unauthorized"},
        )
    return await call_next(request)


# Auth registered before CORS so CORS remains the outermost middleware.
app.add_middleware(BaseHTTPMiddleware, dispatch=auth_dispatch)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Internal-Token"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/graph/data")
def graph_data():
    from connectors.graph import get_full_graph

    return get_full_graph()


@app.get("/audit/logs")
def audit_logs():
    from connectors.audit import generate_audit_logs

    return generate_audit_logs()


# Mount MCP sub-app at /mcp. The MCP server's streamable_http_path
# is set to "/" so the endpoint is accessible at /mcp.
app.mount("/mcp", mcp.streamable_http_app())


def run():
    # Bind to localhost only: this app is internal/redundant (the gateway is the
    # public entrypoint), so it should not be reachable off-host.
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)


if __name__ == "__main__":
    run()
