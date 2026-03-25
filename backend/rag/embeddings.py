"""TF-IDF based embedding generator.

Swappable for real embeddings (sentence-transformers, OpenAI, etc.) later.
"""

from __future__ import annotations

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer


class EmbeddingModel:
    """Generate TF-IDF embeddings for text chunks."""

    def __init__(self):
        self._vectorizer: TfidfVectorizer | None = None
        self._is_fitted = False

    def fit(self, corpus: list[str]) -> None:
        """Fit the vectorizer on a corpus of texts."""
        self._vectorizer = TfidfVectorizer(
            max_features=1000,
            stop_words="english",
            ngram_range=(1, 2),
            sublinear_tf=True,
        )
        self._vectorizer.fit(corpus)
        self._is_fitted = True

    def embed(self, text: str) -> np.ndarray:
        """Generate embedding for a single text."""
        if not self._is_fitted:
            raise RuntimeError("EmbeddingModel must be fitted before embedding")
        return self._vectorizer.transform([text]).toarray()[0]

    def embed_batch(self, texts: list[str]) -> np.ndarray:
        """Generate embeddings for a batch of texts."""
        if not self._is_fitted:
            raise RuntimeError("EmbeddingModel must be fitted before embedding")
        return self._vectorizer.transform(texts).toarray()
