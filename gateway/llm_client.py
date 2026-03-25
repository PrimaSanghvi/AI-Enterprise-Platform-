from __future__ import annotations

import logging

import httpx

from gateway.config import LLM_ENDPOINT

logger = logging.getLogger(__name__)


def _truncate_repetition(text: str) -> str:
    """Cut off text when it starts repeating content."""
    # Split into paragraphs first, then sentences
    paragraphs = text.split("\n\n")
    seen: set[str] = set()
    kept: list[str] = []
    for para in paragraphs:
        normalized = para.strip().lower()[:100]  # compare first 100 chars
        if normalized in seen and len(normalized) > 20:
            break
        seen.add(normalized)
        kept.append(para)

    result = "\n\n".join(kept).strip()

    # Also truncate sentence-level repetition within the kept text
    sentences = result.split(". ")
    seen_s: set[str] = set()
    final: list[str] = []
    for s in sentences:
        norm = s.strip().lower()
        if norm in seen_s and len(norm) > 30:
            break
        seen_s.add(norm)
        final.append(s)

    return ". ".join(final).strip()


async def call_llm(prompt: str, max_tokens: int = 2048) -> str:
    """Call the Ollama LLM completion endpoint and return the generated text."""
    logger.info("Calling LLM at %s (prompt length: %d chars)", LLM_ENDPOINT, len(prompt))
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                LLM_ENDPOINT,
                json={
                    "prompt": prompt,
                    "n_predict": max_tokens,
                    "temperature": 0.1,
                    "top_p": 0.9,
                    "repeat_penalty": 1.3,
                    "stop": ["\nUSER", "\nQUESTION:", "\n\n\n", "\nDATA:"],
                },
            )
            response.raise_for_status()
            data = response.json()
            result = (data.get("content") or data.get("response") or "").strip()
            # Truncate repetition — if the same sentence appears 2+ times, keep only the first
            result = _truncate_repetition(result)
            logger.info("LLM response received (%d chars)", len(result))
            return result
    except httpx.ConnectError as exc:
        logger.error("Cannot connect to LLM endpoint %s: %s", LLM_ENDPOINT, exc)
        raise RuntimeError(f"Cannot connect to LLM at {LLM_ENDPOINT}") from exc
    except httpx.TimeoutException as exc:
        logger.error("LLM request timed out: %s", exc)
        raise RuntimeError("LLM request timed out — prompt may be too large") from exc
    except httpx.HTTPStatusError as exc:
        logger.error("LLM returned HTTP %d: %s", exc.response.status_code, exc.response.text[:500])
        raise RuntimeError(f"LLM returned HTTP {exc.response.status_code}") from exc
