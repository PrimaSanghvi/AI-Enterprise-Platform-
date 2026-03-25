import json
from pathlib import Path

DISPLAY_NAME = "File Server"
RETRIEVAL_DISPLAY_NAME = "Pinecone"

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


def _load(filename: str) -> list:
    with open(FIXTURES_DIR / filename) as f:
        return json.load(f)


def list_deal_files(deal_id: str) -> list[dict]:
    files = _load("deal_files.json")
    return [f for f in files if f["deal_id"] == deal_id]


def search_documents(
    query: str, deal_id: str | None = None, sector: str | None = None
) -> list[dict]:
    """Hybrid RAG search over document chunks.

    Uses TF-IDF vector similarity + keyword matching + re-ranking
    via the RAG pipeline. Falls back to keyword search if RAG fails.
    """
    try:
        from backend.rag.retrieval import search as rag_search

        results = rag_search(query, deal_id=deal_id, sector=sector, top_k=5)
        return [
            {
                "chunk_id": r.chunk_id,
                "deal_id": r.deal_id,
                "sector": r.sector,
                "source_file": r.source_file,
                "text": r.text,
                "metadata": {
                    "section": r.section,
                    "page": r.page,
                    "relevance_score": r.score,
                },
            }
            for r in results
        ]
    except Exception:
        # Fallback to naive keyword search
        return _keyword_search(query, deal_id, sector)


def _keyword_search(
    query: str, deal_id: str | None = None, sector: str | None = None
) -> list[dict]:
    """Fallback keyword search (original implementation)."""
    chunks = _load("documents.json")

    if deal_id:
        chunks = [c for c in chunks if c["deal_id"] == deal_id]
    if sector:
        chunks = [c for c in chunks if c["sector"].lower() == sector.lower()]

    query_words = set(query.lower().split())

    scored = []
    for chunk in chunks:
        text_words = set(chunk["text"].lower().split())
        score = len(query_words & text_words)
        if score > 0:
            scored.append((score, chunk))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [chunk for _, chunk in scored[:5]]
