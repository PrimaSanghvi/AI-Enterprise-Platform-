from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from gateway.agent import run_triage
from gateway.chat import run_chat
from gateway.config import GATEWAY_PORT, MCP_SERVER_URL, ALLOWED_ORIGINS
from gateway.mcp_client import MCPClient

from backend.mcp_server.server import mcp as mcp_server


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
            await asyncio.sleep(attempt)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp_server.session_manager.run():
        mcp_client = MCPClient(f"http://localhost:{GATEWAY_PORT}/mcp")
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
                    raise RuntimeError(
                        f"Cannot connect to MCP server at {MCP_SERVER_URL}. "
                        f"Is the backend running? Error: {exc}"
                    ) from exc
                await asyncio.sleep(0.5 * attempt)


app = FastAPI(title="Rialto AI Gateway", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount MCP server in-process so gateway talks to localhost
app.mount("/mcp", mcp_server.streamable_http_app())


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/deals")
async def list_deals(request: Request):
    """Return all deals with a triage_status field."""
    await ensure_mcp_connected(request)
    raw = await request.app.state.mcp.call_tool("backstop.list_deals", {})
    deals = json.loads(raw)
    for deal in deals:
        triage = deal.get("triage_results")
        deal["triage_status"] = triage[-1]["decision"] if triage else "pending"
    return deals


@app.post("/triage/{deal_id}")
async def triage_deal(deal_id: str, request: Request):
    """Run AI triage for a deal, streaming tool-call events via SSE."""
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
    from backend.connectors.graph import get_full_graph
    return get_full_graph()


@app.get("/audit/logs")
async def audit_logs():
    """Return audit logs generated from fixture data."""
    from backend.connectors.audit import generate_audit_logs

    return generate_audit_logs()


# ── Policy Engine endpoints ──────────────────────────────────────────


@app.get("/policy/rules")
async def list_policy_rules(role: str = "", connector: str = ""):
    """Return all policy rules, optionally filtered by role and/or connector."""
    from backend.connectors.policy import list_rules

    return list_rules(role=role, connector=connector)


@app.get("/policy/rules/{rule_id}")
async def get_policy_rule(rule_id: str):
    """Return a single policy rule by ID."""
    from backend.connectors.policy import get_rule

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
async def create_policy_rule(body: CreatePolicyRuleRequest):
    """Create a new policy rule."""
    from backend.connectors.policy import create_rule

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
async def update_policy_rule(rule_id: str, body: UpdatePolicyRuleRequest):
    """Update an existing policy rule."""
    from backend.connectors.policy import update_rule

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    result = update_rule(rule_id, updates)
    if not result:
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=404, content={"error": f"Rule {rule_id} not found"})
    return result


@app.delete("/policy/rules/{rule_id}")
async def delete_policy_rule(rule_id: str):
    """Delete a policy rule."""
    from backend.connectors.policy import delete_rule

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
    from backend.rag.ingestion import get_vector_store, get_chunk_by_id
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


def run():
    uvicorn.run("gateway.app:app", host="0.0.0.0", port=GATEWAY_PORT, reload=True)


if __name__ == "__main__":
    run()
