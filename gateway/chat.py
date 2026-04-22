from __future__ import annotations

import json
import re
from collections.abc import AsyncGenerator
from typing import Any

import anthropic

from backend.connectors import CONNECTOR_DISPLAY_NAMES
from gateway.config import ANTHROPIC_MODEL
from gateway.intent_classifier import IntentClassifier
from gateway.mcp_client import MCPClient
from gateway.models import ChatResponse

SYSTEM_PROMPT = """\
You are Rialto's AI investment analyst assistant. You only answer questions based on \
data retrieved from the available MCP tools.

You will only be given tools relevant to the question type. \
Use only the tools provided — do not attempt to call tools not in your available list.

If a question spans multiple domains, use all provided tools and synthesize a complete answer.

Available tool categories:
- backstop_* tools: deal and company data from the CRM
- graph_* tools: company relationship data (investors, board, competitors, partners)
- snowflake_* tools: portfolio overlap analytics
- retrieval_* tools: document search across memos, pitch decks, etc.
- files_* tools: file listings for deals

Triage results stored in each deal include which connectors were used during triage.
To answer questions about connectors used for a deal, call backstop.get_deal and inspect
the triage_results[].connectors_used field.

GUARDRAILS — you MUST follow these rules:

If a user asks about something not in the available data:
- Do NOT guess or hallucinate an answer
- Say: "This information is outside our current data scope."
- Tell them what you do have access to:
  - Deal pipeline (Healthcare, Climate, FinTech deals)
  - Company profiles and relationships
  - Portfolio exposure and fund mandate
  - Deal documents and investment memos
  - Graph relationships between entities
  - Connector usage during triage
- Suggest a related question they could ask instead

Examples of out-of-scope queries:
- Stock prices or public market data
- News or current events
- Companies not in the Rialto deal pipeline
- Financial data not in the fixture files

Always ground your answers in tool results. If tools return empty results, say so \
explicitly and suggest a related question.

Always state which data sources you used in your answer.

When you have gathered enough context, provide your final answer wrapped in \
<chat_response>...</chat_response> tags as a JSON object:
{{
  "answer": "<your conversational answer with inline citations>",
  "tools_used": ["<tool_name_1>", "<tool_name_2>"],
  "sources": [{{"title": "<descriptive title>", "deal_id": "<deal_id or empty string>"}}],
  "suggested_followups": ["<question 1>", "<question 2>", "<question 3>"]
}}

FOLLOW-UP SUGGESTIONS:
- Always include exactly 3 suggested_followups — short natural-language questions (under 10 words each)
  that the user might plausibly ask next, continuing from your current answer.
- Each suggestion MUST be answerable from the available tools (deal pipeline, company/graph data,
  portfolio analytics, documents, files). Do not suggest out-of-scope questions.
- Suggestions should explore a different angle than the answer just given (e.g. related deals,
  investor relationships, documents, portfolio overlap, triage history) — not rephrase the same question.
- If the current answer was out-of-scope, suggest in-scope alternatives instead.

FORMATTING RULES:
- Write your answer as plain conversational text. Do NOT use markdown syntax.
- Do NOT use ** for bold, * for italics, # for headings, or - for bullet lists.
- Use natural sentence structure and paragraphs separated by blank lines.
- For lists, use numbered sentences (1. 2. 3.) or write them inline.
- Cite data points naturally within sentences, not as formatted references.

Be conversational but precise. Cite specific data points from the tools you called.
"""

_classifier = IntentClassifier()


def _parse_chat_response(text: str) -> dict:
    """Extract and validate the chat response from Claude's output."""
    match = re.search(r"<chat_response>(.*?)</chat_response>", text, re.DOTALL)
    if not match:
        # Fall back to returning the raw text as the answer
        return ChatResponse(answer=text, tools_used=[], sources=[]).model_dump()
    raw = json.loads(match.group(1).strip())
    output = ChatResponse(**raw)
    return output.model_dump()


async def run_chat(
    message: str,
    conversation_history: list[dict],
    mcp: MCPClient,
) -> AsyncGenerator[dict[str, Any], None]:
    """Run the chat agent loop, yielding SSE-style event dicts."""
    client = anthropic.AsyncAnthropic()

    # Classify intent and filter tools
    intent = _classifier.classify(message)

    yield {
        "event": "intent_classified",
        "data": {
            "strategy": intent.strategy,
            "connectors": intent.connectors,
            "reasoning": intent.reasoning,
        },
    }

    all_tools = await mcp.list_tools()
    tools = [t for t in all_tools if t["name"] in intent.tools]
    # Safety fallback: if filtering left nothing, use all tools
    if not tools:
        tools = all_tools

    # Build messages from conversation history + new message
    messages: list[dict] = []
    for entry in conversation_history:
        messages.append({"role": entry["role"], "content": entry["content"]})
    messages.append({"role": "user", "content": message})

    tools_used: list[str] = []

    while True:
        response = await client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=tools,
            messages=messages,
        )

        # Collect tool_use blocks from this response
        tool_uses = [b for b in response.content if b.type == "tool_use"]

        if tool_uses:
            tool_results = []
            for block in tool_uses:
                # Track tool name
                tools_used.append(block.name)

                # Resolve connector display name
                prefix = block.name.split("_")[0]
                connector = CONNECTOR_DISPLAY_NAMES.get(prefix, prefix)

                yield {
                    "event": "tool_call",
                    "data": {
                        "tool": block.name,
                        "connector": connector,
                        "input": block.input,
                    },
                }

                result_text = await mcp.call_tool(block.name, block.input)
                yield {
                    "event": "tool_result",
                    "data": {
                        "tool": block.name,
                        "connector": connector,
                        "result_preview": result_text[:300],
                    },
                }

                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_text,
                    }
                )

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

        if response.stop_reason == "end_turn":
            full_text = "".join(
                b.text for b in response.content if b.type == "text"
            )
            try:
                chat_resp = _parse_chat_response(full_text)
                # Ensure tools_used reflects what was actually called
                chat_resp["tools_used"] = list(dict.fromkeys(tools_used))
                chat_resp["strategy"] = intent.strategy
                chat_resp["connectors"] = intent.connectors
                yield {"event": "response", "data": chat_resp}
            except (ValueError, json.JSONDecodeError, Exception) as exc:
                yield {
                    "event": "error",
                    "data": {"detail": f"Failed to parse response: {exc}"},
                }
            return
