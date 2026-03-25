import json

from mcp.server.fastmcp import FastMCP

from backend.connectors import files


def register_tools(mcp: FastMCP):
    @mcp.tool(name="retrieval.search")
    def search(
        query: str,
        deal_id: str | None = None,
        sector: str | None = None,
    ) -> str:
        """Search document chunks using hybrid RAG retrieval (vector similarity + keyword matching + re-ranking). Optionally filter by deal_id or sector. Returns top 5 matching chunks with relevance scores."""
        results = files.search_documents(query, deal_id, sector)
        if not results:
            return json.dumps({"error": "No matching documents found"})
        return json.dumps(results)

    @mcp.tool(name="retrieval.get_chunk")
    def get_chunk(chunk_id: str) -> str:
        """Fetch a specific document chunk by its chunk_id. Useful for citation drill-down."""
        from backend.rag.ingestion import get_chunk_by_id

        chunk = get_chunk_by_id(chunk_id)
        if not chunk:
            return json.dumps({"error": f"Chunk {chunk_id} not found"})
        return json.dumps(chunk)
