from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.mcp_server.server import mcp


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage MCP session manager lifecycle."""
    async with mcp.session_manager.run():
        yield


app = FastAPI(title="Rialto API", lifespan=lifespan)

import os as _os

_allowed_origins = _os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/graph/data")
def graph_data():
    from backend.connectors.graph import get_full_graph

    return get_full_graph()


@app.get("/audit/logs")
def audit_logs():
    from backend.connectors.audit import generate_audit_logs

    return generate_audit_logs()


# Mount MCP sub-app at /mcp. The MCP server's streamable_http_path
# is set to "/" so the endpoint is accessible at /mcp.
app.mount("/mcp", mcp.streamable_http_app())


def run():
    import os
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=True)


if __name__ == "__main__":
    run()
