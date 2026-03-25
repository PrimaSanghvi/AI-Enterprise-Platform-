"""In-memory vector store simulating Pinecone.

Supports cosine similarity search with metadata filtering.
Designed to be swapped for real Pinecone later.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity


@dataclass
class VectorRecord:
    vector_id: str
    embedding: np.ndarray
    text: str
    metadata: dict


@dataclass
class SearchResult:
    vector_id: str
    score: float
    text: str
    metadata: dict


class VectorStore:
    """In-memory vector index with metadata-filtered cosine search."""

    def __init__(self):
        self._records: list[VectorRecord] = []

    def upsert(self, vector_id: str, embedding: np.ndarray, text: str, metadata: dict) -> None:
        """Insert or update a vector."""
        # Remove existing record with same ID
        self._records = [r for r in self._records if r.vector_id != vector_id]
        self._records.append(VectorRecord(
            vector_id=vector_id,
            embedding=embedding,
            text=text,
            metadata=metadata,
        ))

    def query(
        self,
        query_embedding: np.ndarray,
        top_k: int = 10,
        filters: dict | None = None,
    ) -> list[SearchResult]:
        """Find top-k most similar vectors, optionally filtered by metadata."""
        candidates = self._records

        # Apply metadata filters
        if filters:
            for key, value in filters.items():
                if value is not None:
                    candidates = [r for r in candidates if r.metadata.get(key) == value]

        if not candidates:
            return []

        # Compute cosine similarity
        embeddings_matrix = np.array([r.embedding for r in candidates])
        query_vec = query_embedding.reshape(1, -1)
        scores = cosine_similarity(query_vec, embeddings_matrix)[0]

        # Sort by score descending and take top_k
        ranked = sorted(
            zip(candidates, scores),
            key=lambda x: x[1],
            reverse=True,
        )[:top_k]

        return [
            SearchResult(
                vector_id=record.vector_id,
                score=float(score),
                text=record.text,
                metadata=record.metadata,
            )
            for record, score in ranked
        ]

    def get(self, vector_id: str) -> VectorRecord | None:
        """Fetch a specific vector by ID."""
        for r in self._records:
            if r.vector_id == vector_id:
                return r
        return None

    @property
    def count(self) -> int:
        return len(self._records)
