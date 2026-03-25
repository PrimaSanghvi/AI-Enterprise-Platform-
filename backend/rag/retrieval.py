"""Hybrid retrieval service with re-ranking and context assembly.

Per LLD Section 8.7: query rewriting → hybrid retrieval → re-ranking → context assembly.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from backend.rag.ingestion import get_embedding_model, get_vector_store

logger = logging.getLogger(__name__)


@dataclass
class RetrievalResult:
    chunk_id: str
    text: str
    score: float
    source_file: str
    section: str
    deal_id: str
    sector: str
    page: int


def search(
    query: str,
    deal_id: str | None = None,
    sector: str | None = None,
    top_k: int = 5,
) -> list[RetrievalResult]:
    """Run the full retrieval pipeline.

    1. Query rewriting
    2. Vector search with metadata filters
    3. Keyword boost (hybrid)
    4. Re-ranking
    5. Return assembled results
    """
    store = get_vector_store()
    model = get_embedding_model()

    # --- Stage 1: Query rewriting ---
    expanded_query = _rewrite_query(query, deal_id, sector)

    # --- Stage 2: Vector search ---
    query_embedding = model.embed(expanded_query)
    filters = {}
    if deal_id:
        filters["deal_id"] = deal_id
    if sector:
        filters["sector"] = sector

    # Retrieve more candidates than needed for re-ranking
    candidates = store.query(query_embedding, top_k=top_k * 3, filters=filters)

    if not candidates:
        # Fallback: try without filters
        candidates = store.query(query_embedding, top_k=top_k * 3)

    if not candidates:
        return []

    # --- Stage 3: Keyword boost (hybrid) ---
    query_words = set(query.lower().split())
    for candidate in candidates:
        text_words = set(candidate.text.lower().split())
        keyword_overlap = len(query_words & text_words) / max(len(query_words), 1)
        # Blend: 70% vector similarity + 30% keyword overlap
        candidate.score = 0.7 * candidate.score + 0.3 * keyword_overlap

    # --- Stage 4: Re-ranking ---
    results = _rerank(candidates, query)

    # --- Stage 5: Assemble results ---
    return [
        RetrievalResult(
            chunk_id=r.metadata.get("chunk_id", r.vector_id),
            text=r.text,
            score=round(r.score, 4),
            source_file=r.metadata.get("source_file", ""),
            section=r.metadata.get("section", ""),
            deal_id=r.metadata.get("deal_id", ""),
            sector=r.metadata.get("sector", ""),
            page=r.metadata.get("page", 0),
        )
        for r in results[:top_k]
    ]


def _rewrite_query(query: str, deal_id: str | None, sector: str | None) -> str:
    """Expand query with contextual terms per LLD Section 8.7.2 Stage 2."""
    parts = [query]
    if deal_id:
        parts.append(f"deal {deal_id}")
    if sector:
        parts.append(sector)
    return " ".join(parts)


def _rerank(candidates: list, query: str) -> list:
    """Re-rank candidates per LLD Section 8.9.

    Boost by:
    - Exact entity/deal name presence
    - Section heading relevance
    - Score (already blended vector + keyword)
    """
    query_lower = query.lower()

    # Section relevance boosts
    section_boosts = {
        "risk": ["risk", "risks", "risk factors", "concerns"],
        "financials": ["revenue", "irr", "growth", "financial", "margin", "cashflow"],
        "market": ["market", "tam", "competition", "competitive"],
        "technology": ["technology", "tech", "platform", "architecture"],
        "team": ["team", "founder", "leadership", "management"],
        "traction": ["traction", "customers", "partnerships", "growth"],
    }

    for candidate in candidates:
        section = candidate.metadata.get("section", "").lower()

        # Boost if query mentions terms related to this section
        for section_name, keywords in section_boosts.items():
            if section == section_name:
                if any(kw in query_lower for kw in keywords):
                    candidate.score += 0.15
                break

        # Boost if source file name appears in query
        source = candidate.metadata.get("source_file", "").lower()
        source_words = source.replace("_", " ").replace(".pdf", "").split()
        if any(w in query_lower for w in source_words if len(w) > 3):
            candidate.score += 0.1

    # Sort by final score
    candidates.sort(key=lambda c: c.score, reverse=True)
    return candidates
