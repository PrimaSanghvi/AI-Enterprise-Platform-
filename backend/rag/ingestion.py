"""Document ingestion pipeline.

Loads chunked documents from fixtures, generates embeddings,
and indexes them in the vector store.

Per LLD Section 8.3: acquisition → enrichment → embedding → upsert.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

from backend.rag.embeddings import EmbeddingModel
from backend.rag.vector_store import VectorStore

logger = logging.getLogger(__name__)

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"

# Singleton instances — initialized once, reused across requests
_embedding_model: EmbeddingModel | None = None
_vector_store: VectorStore | None = None
_chunks: list[dict] | None = None


def _deterministic_id(chunk: dict) -> str:
    """Generate a deterministic vector ID per LLD Section 8.6.2."""
    raw = f"{chunk.get('source_file', '')}-{chunk.get('chunk_id', '')}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def get_vector_store() -> VectorStore:
    """Get or initialize the vector store (lazy singleton)."""
    global _embedding_model, _vector_store, _chunks

    if _vector_store is not None:
        return _vector_store

    logger.info("Initializing RAG ingestion pipeline...")

    # Stage 1: Load documents
    with open(FIXTURES_DIR / "documents.json") as f:
        _chunks = json.load(f)

    logger.info("Loaded %d document chunks", len(_chunks))

    # Stage 2: Extract texts for embedding
    texts = [chunk["text"] for chunk in _chunks]

    # Stage 3: Fit embedding model on corpus
    _embedding_model = EmbeddingModel()
    _embedding_model.fit(texts)

    # Stage 4: Generate embeddings
    embeddings = _embedding_model.embed_batch(texts)
    logger.info("Generated embeddings: shape %s", embeddings.shape)

    # Stage 5: Build vector index
    _vector_store = VectorStore()
    for chunk, embedding in zip(_chunks, embeddings):
        vector_id = _deterministic_id(chunk)
        metadata = {
            "chunk_id": chunk["chunk_id"],
            "deal_id": chunk.get("deal_id", ""),
            "sector": chunk.get("sector", ""),
            "source_file": chunk.get("source_file", ""),
            "section": chunk.get("metadata", {}).get("section", ""),
            "page": chunk.get("metadata", {}).get("page", 0),
        }
        _vector_store.upsert(
            vector_id=vector_id,
            embedding=embedding,
            text=chunk["text"],
            metadata=metadata,
        )

    logger.info("Vector store ready: %d vectors indexed", _vector_store.count)
    return _vector_store


def get_embedding_model() -> EmbeddingModel:
    """Get the embedding model (initializes vector store if needed)."""
    global _embedding_model
    if _embedding_model is None:
        get_vector_store()  # triggers initialization
    return _embedding_model


def get_chunk_by_id(chunk_id: str) -> dict | None:
    """Fetch a raw chunk by its chunk_id."""
    global _chunks
    if _chunks is None:
        get_vector_store()  # triggers initialization
    for chunk in _chunks:
        if chunk["chunk_id"] == chunk_id:
            return chunk
    return None
