from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from typing import Any

import anthropic

from connectors import CONNECTOR_DISPLAY_NAMES
from gateway.config import ANTHROPIC_MODEL
from gateway.mcp_client import MCPClient

ALLOWED_TOOLS = {
    "backstop.list_deals",
    "backstop_list_deals",
    "backstop.get_company",
    "backstop_get_company",
    "backstop.create_company_stub",
    "backstop_create_company_stub",
    "backstop.create_deal",
    "backstop_create_deal",
}

SYSTEM_PROMPT = """\
You are an intake assistant for Rialto Capital. Your job is to gather enough \
information to create a new deal record, then call backstop.create_deal.

Required fields (you MUST collect all six before creating):
- company_name: string
- sector: one of "Healthcare", "Climate", or "FinTech"
- stage: e.g. "Seed", "Series A", "Series B", "Series C"
- status: one of "new", "screening", "due_diligence", "ic_review"
- ask_amount: integer USD (the amount being raised)
- valuation: integer USD (pre- or post-money — accept whatever the user gives)

Optional fields you may also collect: source, lead_partner, date_received.

Rules:
1. Ask ONE concise question per turn. Do not bundle multiple questions.
2. Accept user-provided values as given. Do NOT re-confirm values the user just stated.
3. If the user provides multiple fields at once, accept them all and move to the next missing one.
4. Do not ask about optional fields unless the user offers them.
5. Once all six required fields are gathered, call backstop.create_deal immediately. \
Do not ask for confirmation first — just create the deal.
6. After backstop.create_deal succeeds, respond with a single short sentence \
confirming the deal id (e.g. "Created DEAL-009.").

Style: short and direct. No markdown, no preamble like "Great!" or "Sure!".
"""


async def run_deal_intake(
    message: str,
    conversation_history: list[dict],
    mcp: MCPClient,
) -> AsyncGenerator[dict[str, Any], None]:
    """Run the intake agent loop, yielding SSE-style event dicts.

    Emits:
      - tool_call / tool_result: each MCP tool invocation
      - question: the assistant's next question (when it ends a turn without creating a deal)
      - deal_created: the persisted deal JSON (after create_deal succeeds)
      - error: on parse / API failures
    """
    client = anthropic.AsyncAnthropic()

    all_tools = await mcp.list_tools()
    tools = [t for t in all_tools if t["name"] in ALLOWED_TOOLS]
    # Fail closed: if no allow-listed tool is available, do not widen to all tools.
    if not tools:
        yield {
            "event": "error",
            "data": {"detail": "Deal-intake tools are unavailable; refusing to proceed."},
        }
        return

    messages: list[dict] = []
    for entry in conversation_history:
        messages.append({"role": entry["role"], "content": entry["content"]})
    messages.append({"role": "user", "content": message})

    created_deal: dict | None = None

    while True:
        try:
            response = await client.messages.create(
                model=ANTHROPIC_MODEL,
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                tools=tools,
                messages=messages,
            )
        except Exception as exc:
            yield {"event": "error", "data": {"detail": f"Anthropic API error: {exc}"}}
            return

        tool_uses = [b for b in response.content if b.type == "tool_use"]

        if tool_uses:
            tool_results = []
            for block in tool_uses:
                prefix = block.name.split(".")[0].split("_")[0]
                connector = CONNECTOR_DISPLAY_NAMES.get(prefix, prefix)
                yield {
                    "event": "tool_call",
                    "data": {"tool": block.name, "connector": connector, "input": block.input},
                }
                # Defense-in-depth: never dispatch a tool outside the allow-list.
                if block.name not in ALLOWED_TOOLS:
                    result_text = f"ERROR: tool '{block.name}' is not permitted for deal intake."
                else:
                    result_text = await mcp.call_tool(block.name, block.input)
                yield {
                    "event": "tool_result",
                    "data": {"tool": block.name, "connector": connector, "result_preview": result_text[:300]},
                }

                if block.name in {"backstop.create_deal", "backstop_create_deal"}:
                    try:
                        parsed = json.loads(result_text)
                        if isinstance(parsed, dict) and "error" not in parsed:
                            created_deal = parsed
                    except json.JSONDecodeError:
                        pass

                tool_results.append(
                    {"type": "tool_result", "tool_use_id": block.id, "content": result_text}
                )

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

        if response.stop_reason == "end_turn":
            full_text = "".join(b.text for b in response.content if b.type == "text").strip()

            if created_deal is not None:
                yield {
                    "event": "deal_created",
                    "data": {"deal": created_deal, "message": full_text},
                }
            else:
                yield {"event": "question", "data": {"message": full_text}}
            return

        if response.stop_reason not in ("tool_use", "end_turn"):
            yield {
                "event": "error",
                "data": {"detail": f"Unexpected stop_reason: {response.stop_reason}"},
            }
            return
