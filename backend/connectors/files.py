from backend.db import SCHEMA, query

DISPLAY_NAME = "File Server"
RETRIEVAL_DISPLAY_NAME = "Pinecone"


def list_deal_files(deal_id: str) -> list[dict]:
    return query(
        f"SELECT * FROM {SCHEMA}.deal_files WHERE deal_id = %s",
        (deal_id,),
    )


def search_documents(
    query_text: str, deal_id: str | None = None, sector: str | None = None
) -> list[dict]:
    """Hybrid RAG search over document chunks.

    Uses TF-IDF vector similarity + keyword matching + re-ranking
    via the RAG pipeline. Falls back to keyword search if RAG fails.
    """
    try:
        from backend.rag.retrieval import search as rag_search

        results = rag_search(query_text, deal_id=deal_id, sector=sector, top_k=5)
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
        return _keyword_search(query_text, deal_id, sector)


def _keyword_search(
    query_text: str, deal_id: str | None = None, sector: str | None = None
) -> list[dict]:
    sql = f"SELECT * FROM {SCHEMA}.document_chunks WHERE 1=1"
    params: list = []
    if deal_id:
        sql += " AND deal_id = %s"
        params.append(deal_id)
    if sector:
        sql += " AND LOWER(sector) = LOWER(%s)"
        params.append(sector)
    chunks = query(sql, params if params else None)

    query_words = set(query_text.lower().split())
    scored = []
    for chunk in chunks:
        text_words = set(chunk["text"].lower().split())
        score = len(query_words & text_words)
        if score > 0:
            scored.append((score, chunk))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [chunk for _, chunk in scored[:5]]
