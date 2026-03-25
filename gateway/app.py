from __future__ import annotations

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start / stop the persistent MCP client session."""
    import asyncio

    mcp_client = MCPClient(MCP_SERVER_URL)
    retries = 3
    for attempt in range(1, retries + 1):
        try:
            await mcp_client.connect()
            break
        except Exception as exc:
            if attempt == retries:
                raise RuntimeError(
                    f"Cannot connect to MCP server at {MCP_SERVER_URL}. "
                    f"Is the backend running? Error: {exc}"
                ) from exc
            await asyncio.sleep(2)
    app.state.mcp = mcp_client
    yield
    await mcp_client.disconnect()


app = FastAPI(title="Rialto AI Gateway", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/deals")
async def list_deals(request: Request):
    """Return all deals with a triage_status field."""
    raw = await request.app.state.mcp.call_tool("backstop.list_deals", {})
    deals = json.loads(raw)
    for deal in deals:
        triage = deal.get("triage_results")
        deal["triage_status"] = triage[-1]["decision"] if triage else "pending"
    return deals


@app.post("/triage/{deal_id}")
async def triage_deal(deal_id: str, request: Request):
    """Run AI triage for a deal, streaming tool-call events via SSE."""
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
    import json as _json
    from pathlib import Path

    fixtures = Path(__file__).resolve().parent.parent / "backend" / "fixtures"

    with open(fixtures / "relationships.json") as f:
        relationships = _json.load(f)

    with open(fixtures / "deals.json") as f:
        deals = _json.load(f)

    # Build company → deal mapping
    company_deals = {}
    for deal in deals:
        company_deals[deal["company_id"]] = deal

    nodes = []
    edges = []
    seen_nodes = set()

    for company_id, data in relationships.items():
        company_name = data["company_name"]
        deal = company_deals.get(company_id, {})

        # Company node
        if company_id not in seen_nodes:
            nodes.append({
                "id": company_id,
                "label": company_name,
                "type": "company",
                "sector": deal.get("sector", ""),
                "deal_id": deal.get("deal_id", ""),
            })
            seen_nodes.add(company_id)

        # Relationship nodes + edges
        for rel in data.get("relationships", []):
            entity_id = rel["entity_id"]
            if entity_id not in seen_nodes:
                nodes.append({
                    "id": entity_id,
                    "label": rel["name"],
                    "type": rel["type"],
                    "details": rel.get("details", ""),
                })
                seen_nodes.add(entity_id)

            edges.append({
                "source": company_id,
                "target": entity_id,
                "relationship": rel["type"],
                "details": rel.get("details", ""),
            })

    return {"nodes": nodes, "edges": edges}


@app.get("/audit/logs")
async def audit_logs():
    """Return audit logs generated from fixture data."""
    from backend.connectors.audit import generate_audit_logs

    return generate_audit_logs()


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
