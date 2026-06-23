from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from starlette.middleware.base import BaseHTTPMiddleware

from gateway import ratelimit
from gateway.agent import run_triage
from gateway.auth import AuthError, login, require_active_user, verify_mcp_credentials
from gateway.chat import run_chat
from gateway.config import (
    ALLOWED_ORIGINS,
    GATEWAY_PORT,
    GOOGLE_CLIENT_ID,
    MCP_INTERNAL_TOKEN,
    MCP_SERVER_URL,
    POLICY_ADMIN_ROLE,
)
from gateway.deal_intake_agent import run_deal_intake
from gateway.mcp_client import MCPClient
from gateway.models import ChatDealRequest, GoogleAuthRequest, NewDealInput

from mcp_server.server import mcp as mcp_server
from security import issue_service_token


logger = logging.getLogger("gateway.app")


async def _warmup_mcp(app: FastAPI) -> None:
    """Connect the MCP client in the background after the HTTP server is ready.

    Runs concurrently with the server so the first real browser request finds
    MCP already connected instead of paying the full connection cost.
    """
    await asyncio.sleep(1)  # give uvicorn a moment to finish binding
    for attempt in range(1, 4):
        try:
            async with app.state.mcp_lock:
                if not app.state.mcp_connected:
                    await app.state.mcp.connect()
                    app.state.mcp_connected = True
            return
        except Exception:
            # Log the real cause — previously swallowed, which hid why MCP-backed
            # routes (/deals, /chat, …) fail with a masked 500.
            logger.exception("MCP warmup attempt %d/3 failed", attempt)
            await asyncio.sleep(attempt)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp_server.session_manager.run():
        # The /mcp mount now requires the internal token AND a session token, so
        # the gateway's own client presents both: the shared internal secret and
        # a long-lived service session token.
        mcp_headers = {
            "X-Internal-Token": MCP_INTERNAL_TOKEN,
            "Authorization": f"Bearer {issue_service_token()}",
        }
        # Trailing slash avoids the /mcp -> /mcp/ redirect (which the catch-all
        # StaticFiles mount at "/" disrupts), connecting straight to the sub-app.
        mcp_client = MCPClient(f"http://localhost:{GATEWAY_PORT}/mcp/", headers=mcp_headers)
        app.state.mcp = mcp_client
        app.state.mcp_connected = False
        app.state.mcp_lock = asyncio.Lock()

        # Proactively connect MCP so it is ready before the first browser request
        asyncio.create_task(_warmup_mcp(app))

        yield
        await mcp_client.disconnect()


async def ensure_mcp_connected(request: Request):
    """Ensure MCP is connected before calling a tool.

    Uses a lock so concurrent requests never race to call connect() at the
    same time — only one attempt runs, others wait and reuse the result.
    """
    if request.app.state.mcp_connected:
        return
    async with request.app.state.mcp_lock:
        if request.app.state.mcp_connected:  # re-check after acquiring lock
            return
        for attempt in range(1, 4):
            try:
                await request.app.state.mcp.connect()
                request.app.state.mcp_connected = True
                return
            except Exception as exc:
                if attempt == 3:
                    # Log the real exception (full traceback) before raising so the
                    # actual cause appears in logs — e.g. a 401 from the /mcp mount
                    # (MCP_INTERNAL_TOKEN / session-token issue) vs a transport error.
                    logger.exception("MCP connect failed after 3 attempts")
                    # HTTPException (not RuntimeError) so FastAPI returns a clean
                    # JSON 503 instead of BaseHTTPMiddleware masking it as
                    # "No response returned".
                    raise HTTPException(
                        status_code=503,
                        detail=(
                            f"Cannot connect to MCP server at {MCP_SERVER_URL}. "
                            f"Verify MCP_INTERNAL_TOKEN is set on the server. Error: {exc}"
                        ),
                    ) from exc
                await asyncio.sleep(0.5 * attempt)


app = FastAPI(title="Rialto AI Gateway", lifespan=lifespan)


# --- Authenticate every request ---
# Public paths require no credential. /auth is the login flow. /mcp is NOT public:
# it requires the internal service token AND a session token (handled below).
_AUTH_PUBLIC_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}
_AUTH_PUBLIC_PREFIXES = ("/auth",)

# The built SPA must load before login, so its static assets are public (GET only,
# no sensitive data). The app entry is "/" (index.html); Vite emits hashed bundles
# under /assets plus public/ files (logos, icons) at the root. We match those by
# path/extension — no API route ends in a static-file extension.
_STATIC_PUBLIC_PATHS = {"/", "/index.html"}
_STATIC_PUBLIC_PREFIXES = ("/assets",)
_STATIC_PUBLIC_SUFFIXES = (
    ".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
    ".woff", ".woff2", ".ttf", ".map", ".json", ".txt", ".webmanifest",
)


def _is_public_static(path: str) -> bool:
    return (
        path in _STATIC_PUBLIC_PATHS
        or path.startswith(_STATIC_PUBLIC_PREFIXES)
        or path.endswith(_STATIC_PUBLIC_SUFFIXES)
    )


def _bearer_token(request: Request) -> str:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return ""


def _auth_error_response(exc: AuthError) -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={"error": exc.message, "code": "expired" if exc.expired else "unauthorized"},
    )


async def auth_dispatch(request: Request, call_next):
    path = request.url.path
    if (
        request.method == "OPTIONS"
        or path in _AUTH_PUBLIC_PATHS
        or any(path.startswith(p) for p in _AUTH_PUBLIC_PREFIXES)
    ):
        return await call_next(request)

    # Public static frontend assets (GET/HEAD only).
    if request.method in ("GET", "HEAD") and _is_public_static(path):
        return await call_next(request)

    # The MCP mount requires dual credentials (internal token + session token).
    if path.startswith("/mcp"):
        try:
            request.state.user = verify_mcp_credentials(
                request.headers.get("x-internal-token"), _bearer_token(request)
            )
        except AuthError as exc:
            return _auth_error_response(exc)
        return await call_next(request)

    token = _bearer_token(request)
    if not token:
        return JSONResponse(
            status_code=401,
            content={"error": "Not authenticated.", "code": "unauthenticated"},
        )
    try:
        request.state.user = require_active_user(token)
    except AuthError as exc:
        return _auth_error_response(exc)
    return await call_next(request)


def _require_admin(request: Request) -> JSONResponse | None:
    """Return a 403 response unless the caller holds the policy-admin role."""
    role = (getattr(request.state, "user", None) or {}).get("role")
    if role != POLICY_ADMIN_ROLE:
        return JSONResponse(
            status_code=403,
            content={"error": f"Requires role '{POLICY_ADMIN_ROLE}'.", "code": "forbidden"},
        )
    return None


def _rate_limit(request: Request, bucket: str) -> JSONResponse | None:
    """Return a 429 response if the caller has exceeded the agent rate limit."""
    identity = (getattr(request.state, "user", None) or {}).get("email", "anonymous")
    try:
        ratelimit.check(identity, bucket)
    except ratelimit.RateLimitExceeded as exc:
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded. Please slow down.", "code": "rate_limited"},
            headers={"Retry-After": str(int(exc.retry_after) + 1)},
        )
    return None


# Registered BEFORE CORS so CORS stays the outermost middleware and attaches
# headers to 401 responses too (otherwise the browser can't read the expiry).
app.add_middleware(BaseHTTPMiddleware, dispatch=auth_dispatch)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Internal-Token"],
)

# Mount MCP server in-process so gateway talks to localhost
app.mount("/mcp", mcp_server.streamable_http_app())


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/google")
async def auth_google(body: GoogleAuthRequest):
    """Exchange a Google ID token for a session token, enforcing the 2-hour window."""
    try:
        return login(body.credential)
    except AuthError as exc:
        return JSONResponse(
            status_code=exc.status,
            content={"error": exc.message, "code": "expired" if exc.expired else "error"},
        )


@app.get("/auth/config")
async def auth_config():
    """Public: browser-side auth config resolved at RUNTIME from the container's
    GOOGLE_CLIENT_ID env. The SPA fetches this on load instead of relying on a
    build-time VITE_GOOGLE_CLIENT_ID, so one image works in any environment."""
    return {"googleClientId": GOOGLE_CLIENT_ID}


@app.get("/auth/me")
async def auth_me(request: Request):
    """Return the current user if their session is still valid (used on app load)."""
    token = _bearer_token(request)
    if not token:
        return JSONResponse(status_code=401, content={"error": "Not authenticated.", "code": "unauthenticated"})
    try:
        return require_active_user(token)
    except AuthError as exc:
        return JSONResponse(
            status_code=401,
            content={"error": exc.message, "code": "expired" if exc.expired else "unauthorized"},
        )


@app.get("/deals")
async def list_deals(request: Request):
    """Return all deals with a triage_status field."""
    await ensure_mcp_connected(request)
    raw = await request.app.state.mcp.call_tool("backstop.list_deals", {})
    # call_tool returns "ERROR: …" on a tool failure; don't blindly json.loads it
    # (that would throw and surface as a masked 500).
    if raw.startswith("ERROR:"):
        raise HTTPException(status_code=502, detail=f"MCP tool 'backstop.list_deals' failed: {raw}")
    deals = json.loads(raw)
    for deal in deals:
        triage = deal.get("triage_results")
        deal["triage_status"] = triage[-1]["decision"] if triage else "pending"
    return deals


async def _create_deal_via_mcp(request: Request, payload: dict) -> dict:
    """Validate via NewDealInput and create the deal through the MCP backstop.create_deal tool."""
    await ensure_mcp_connected(request)
    mcp_client: MCPClient = request.app.state.mcp
    args = {k: v for k, v in payload.items() if v is not None}
    raw = await mcp_client.call_tool("backstop.create_deal", args)
    return json.loads(raw)


@app.post("/deals")
async def create_deal(body: NewDealInput, request: Request):
    """Create a new deal from a manual form submission."""
    result = await _create_deal_via_mcp(request, body.model_dump())
    if "error" in result:
        status = 409 if "already exists" in result["error"] else 400
        return JSONResponse(status_code=status, content=result)
    return result


@app.post("/deals/upload")
async def upload_deal(request: Request, file: UploadFile = File(...)):
    """Create a single deal from an uploaded .json or .csv file. Multi-row CSVs use row 0 + warning."""
    raw_bytes = await file.read()
    filename = (file.filename or "").lower()
    warnings: list[str] = []

    try:
        if filename.endswith(".json"):
            data = json.loads(raw_bytes.decode("utf-8"))
            if isinstance(data, list):
                if not data:
                    return JSONResponse(status_code=400, content={"error": "JSON array is empty"})
                if len(data) > 1:
                    warnings.append(f"File contained {len(data)} records; only the first was created.")
                row = data[0]
            else:
                row = data
        elif filename.endswith(".csv"):
            text = raw_bytes.decode("utf-8")
            reader = csv.DictReader(io.StringIO(text))
            rows = list(reader)
            if not rows:
                return JSONResponse(status_code=400, content={"error": "CSV has no data rows"})
            if len(rows) > 1:
                warnings.append(f"File contained {len(rows)} rows; only the first was created.")
            row = rows[0]
            for int_field in ("ask_amount", "valuation"):
                if int_field in row and row[int_field] not in (None, ""):
                    try:
                        row[int_field] = int(float(row[int_field]))
                    except (TypeError, ValueError):
                        return JSONResponse(
                            status_code=400,
                            content={"error": f"Could not parse {int_field}={row[int_field]!r} as integer"},
                        )
        else:
            return JSONResponse(
                status_code=400,
                content={"error": "Unsupported file type. Use .json or .csv."},
            )
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        return JSONResponse(status_code=400, content={"error": f"Failed to parse file: {exc}"})

    try:
        validated = NewDealInput(**row)
    except ValidationError as exc:
        return JSONResponse(status_code=400, content={"error": "Validation failed", "detail": exc.errors()})

    result = await _create_deal_via_mcp(request, validated.model_dump())
    if "error" in result:
        status = 409 if "already exists" in result["error"] else 400
        return JSONResponse(status_code=status, content={**result, "warnings": warnings})
    return {"deal": result, "warnings": warnings}


@app.post("/deals/from-chat")
async def deal_from_chat(body: ChatDealRequest, request: Request):
    """Stream an AI-assisted Q&A session that gathers deal fields and creates the deal when ready."""
    limited = _rate_limit(request, "deal_intake")
    if limited:
        return limited
    await ensure_mcp_connected(request)
    mcp_client: MCPClient = request.app.state.mcp

    async def event_stream():
        async for event in run_deal_intake(body.message, body.conversation_history, mcp_client):
            evt_type = event["event"]
            payload = json.dumps(event["data"])
            yield f"event: {evt_type}\ndata: {payload}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/triage/{deal_id}")
async def triage_deal(deal_id: str, request: Request):
    """Run AI triage for a deal, streaming tool-call events via SSE."""
    limited = _rate_limit(request, "triage")
    if limited:
        return limited
    await ensure_mcp_connected(request)
    mcp_client: MCPClient = request.app.state.mcp

    async def event_stream():
        async for event in run_triage(deal_id, mcp_client):
            evt_type = event["event"]
            payload = json.dumps(event["data"])
            yield f"event: {evt_type}\ndata: {payload}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


class ChatRequest(BaseModel):
    message: str
    conversation_history: list[dict] = []


@app.post("/chat")
async def chat(body: ChatRequest, request: Request):
    """Chat with the AI analyst, streaming tool-call events via SSE."""
    limited = _rate_limit(request, "chat")
    if limited:
        return limited
    await ensure_mcp_connected(request)
    mcp_client: MCPClient = request.app.state.mcp

    async def event_stream():
        async for event in run_chat(body.message, body.conversation_history, mcp_client):
            evt_type = event["event"]
            payload = json.dumps(event["data"])
            yield f"event: {evt_type}\ndata: {payload}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/graph/data")
async def graph_data():
    """Return relationship graph data as nodes + edges for visualization."""
    from connectors.graph import get_full_graph
    return get_full_graph()


@app.get("/audit/logs")
async def audit_logs():
    """Return audit logs generated from fixture data."""
    from connectors.audit import generate_audit_logs

    return generate_audit_logs()


# ── Policy Engine endpoints ──────────────────────────────────────────


@app.get("/policy/rules")
async def list_policy_rules(role: str = "", connector: str = ""):
    """Return all policy rules, optionally filtered by role and/or connector."""
    from connectors.policy import list_rules

    return list_rules(role=role, connector=connector)


@app.get("/policy/rules/{rule_id}")
async def get_policy_rule(rule_id: str):
    """Return a single policy rule by ID."""
    from connectors.policy import get_rule

    rule = get_rule(rule_id)
    if not rule:
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=404, content={"error": f"Rule {rule_id} not found"})
    return rule


class CreatePolicyRuleRequest(BaseModel):
    role: str
    connector: str
    operations: list[str]
    fieldRestrictions: list[str] = []
    rowFilters: dict = {}
    description: str = ""
    enabled: bool = True


@app.post("/policy/rules")
async def create_policy_rule(body: CreatePolicyRuleRequest, request: Request):
    """Create a new policy rule. Restricted to the policy-admin role."""
    denied = _require_admin(request)
    if denied:
        return denied
    from connectors.policy import create_rule

    rule = create_rule(
        role=body.role,
        connector=body.connector,
        operations=body.operations,
        field_restrictions=body.fieldRestrictions,
        row_filters=body.rowFilters,
        description=body.description,
        enabled=body.enabled,
    )
    return rule


class UpdatePolicyRuleRequest(BaseModel):
    role: str | None = None
    connector: str | None = None
    operations: list[str] | None = None
    fieldRestrictions: list[str] | None = None
    rowFilters: dict | None = None
    description: str | None = None
    enabled: bool | None = None


@app.put("/policy/rules/{rule_id}")
async def update_policy_rule(rule_id: str, body: UpdatePolicyRuleRequest, request: Request):
    """Update an existing policy rule. Restricted to the policy-admin role."""
    denied = _require_admin(request)
    if denied:
        return denied
    from connectors.policy import update_rule

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    result = update_rule(rule_id, updates)
    if not result:
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=404, content={"error": f"Rule {rule_id} not found"})
    return result


@app.delete("/policy/rules/{rule_id}")
async def delete_policy_rule(rule_id: str, request: Request):
    """Delete a policy rule. Restricted to the policy-admin role."""
    denied = _require_admin(request)
    if denied:
        return denied
    from connectors.policy import delete_rule

    deleted = delete_rule(rule_id)
    if not deleted:
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=404, content={"error": f"Rule {rule_id} not found"})
    return {"status": "deleted", "rule_id": rule_id}


class SimulatePolicyRequest(BaseModel):
    role: str
    connector: str
    operation: str
    fields: list[str] = []


@app.post("/policy/simulate")
async def simulate_policy(body: SimulatePolicyRequest, request: Request):
    """Evaluate a policy request via the MCP policy engine. Returns decision + reasoning trace."""
    await ensure_mcp_connected(request)
    mcp_client: MCPClient = request.app.state.mcp
    fields_str = ",".join(body.fields) if body.fields else ""
    raw = await mcp_client.call_tool(
        "policy.evaluate",
        {
            "role": body.role,
            "connector": body.connector,
            "operation": body.operation,
            "fields": fields_str,
        },
    )
    return json.loads(raw)


@app.get("/rag/stats")
async def rag_stats():
    """Return live RAG pipeline stats from the backend vector store."""
    from rag.ingestion import get_vector_store, get_chunk_by_id
    import json as _json
    from pathlib import Path

    store = get_vector_store()

    # Build document manifest from indexed vectors
    docs: dict[str, dict] = {}
    for record in store._records:
        source = record.metadata.get("source_file", "unknown")
        if source not in docs:
            docs[source] = {
                "source_file": source,
                "deal_id": record.metadata.get("deal_id", ""),
                "sector": record.metadata.get("sector", ""),
                "chunks": 0,
                "status": "indexed",
            }
        docs[source]["chunks"] += 1

    return {
        "vector_count": store.count,
        "document_count": len(docs),
        "pipeline_stages": [
            {"id": "ingest", "name": "Ingest", "status": "done"},
            {"id": "chunk", "name": "Chunk", "status": "done"},
            {"id": "embed", "name": "Embed", "status": "done"},
            {"id": "index", "name": "Index", "status": "done"},
            {"id": "retrieve", "name": "Retrieve", "status": "ready"},
            {"id": "rerank", "name": "Rerank", "status": "ready"},
        ],
        "config": {
            "embedding_model": "TF-IDF (scikit-learn)",
            "vector_dimensions": 1000,
            "chunk_strategy": "Pre-chunked (500-1000 tokens)",
            "vector_store": "In-memory (Pinecone simulation)",
            "retrieval_mode": "Hybrid (70% vector + 30% keyword)",
            "vector_weight": 0.7,
            "keyword_weight": 0.3,
            "reranking": "Section boost + entity match",
            "top_k": 5,
        },
        "documents": list(docs.values()),
    }


# Serve the built frontend (single-container deploys). Mounted LAST so it only
# catches paths not matched by an API route or the /mcp mount. Skipped in dev,
# where the frontend runs separately under Vite and this directory is absent.
_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=_FRONTEND_DIST, html=True), name="frontend")


def run():
    uvicorn.run("gateway.app:app", host="0.0.0.0", port=GATEWAY_PORT, reload=True)


if __name__ == "__main__":
    run()
