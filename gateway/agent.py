from __future__ import annotations

import json
import re
from collections.abc import AsyncGenerator
from typing import Any

import anthropic

from backend.connectors import CONNECTOR_DISPLAY_NAMES
from gateway.config import ANTHROPIC_MODEL
from gateway.mcp_client import MCPClient
from gateway.models import TriageOutput

SYSTEM_PROMPT = """\
You are a senior investment analyst at Rialto Capital. You are triaging deal {deal_id}.

Your task:
1. Retrieve the deal details using backstop.get_deal
2. Retrieve the company profile using backstop.get_company (use the company_id from the deal)
3. Check relationships using graph.get_relationships (use the company_id)
4. Search for relevant documents using retrieval.search (search for the company name or sector)
5. Check portfolio overlap using snowflake.portfolio_overlap (use the deal's sector)
6. List deal files using files.list_deal_files

After gathering all information, provide your triage assessment as a JSON object with this exact schema:
{{
  "deal_id": "{deal_id}",
  "recommendation": "proceed" | "pass" | "monitor",
  "mandate_fit_score": <integer 0-10>,
  "flags": [{{"type": "<string>", "severity": "high" | "medium" | "low", "detail": "<string>"}}],
  "recommended_actions": [{{"priority": <integer>, "action": "<string>", "owner": "<string>"}}],
  "analyst_summary": "<2-3 paragraph summary>",
  "confidence": <float 0.0-1.0>
}}

Wrap your final JSON output in <triage_result>...</triage_result> tags.
"""


def _parse_triage_result(text: str, deal_id: str) -> dict:
    """Extract and validate the triage result from Claude's response."""
    match = re.search(r"<triage_result>(.*?)</triage_result>", text, re.DOTALL)
    if not match:
        raise ValueError("No <triage_result> tags found in response")
    raw = json.loads(match.group(1).strip())
    output = TriageOutput(**raw)
    return output.model_dump()


async def run_triage(
    deal_id: str,
    mcp: MCPClient,
) -> AsyncGenerator[dict[str, Any], None]:
    """Run the triage agent loop, yielding SSE-style event dicts."""
    client = anthropic.AsyncAnthropic()
    tools = await mcp.list_tools()
    messages: list[dict] = [
        {"role": "user", "content": f"Triage deal {deal_id}. Call the tools to gather all relevant context, then provide your structured assessment."},
    ]
    connectors_seen: set[str] = set()

    while True:
        response = await client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT.format(deal_id=deal_id),
            tools=tools,
            messages=messages,
        )

        # Collect tool_use blocks from this response
        tool_uses = [b for b in response.content if b.type == "tool_use"]

        if tool_uses:
            # Execute all tool calls and yield SSE events
            tool_results = []
            for block in tool_uses:
                # Tool names may use dots (backstop.get_deal) or underscores
                # (backstop_get_deal) depending on the MCP transport.
                prefix = block.name.split(".")[0].split("_")[0]
                connectors_seen.add(CONNECTOR_DISPLAY_NAMES.get(prefix, prefix))
                connector = CONNECTOR_DISPLAY_NAMES.get(prefix, prefix)
                yield {
                    "event": "tool_call",
                    "data": {"tool": block.name, "connector": connector, "input": block.input},
                }

                result_text = await mcp.call_tool(block.name, block.input)
                yield {
                    "event": "tool_result",
                    "data": {"tool": block.name, "connector": connector, "result_preview": result_text[:300]},
                }

                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_text,
                    }
                )

            # Append assistant response and all tool results as a single user message
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

        if response.stop_reason == "end_turn":
            # Extract final text from the response
            full_text = "".join(
                b.text for b in response.content if b.type == "text"
            )
            try:
                triage = _parse_triage_result(full_text, deal_id)
                triage["connectors_used"] = sorted(connectors_seen)
                triage["strategy"] = "triage_workflow"
                yield {"event": "result", "data": triage}
            except (ValueError, json.JSONDecodeError, Exception) as exc:
                yield {
                    "event": "error",
                    "data": {"detail": f"Failed to parse triage result: {exc}", "raw_text": full_text[:500]},
                }
            return
