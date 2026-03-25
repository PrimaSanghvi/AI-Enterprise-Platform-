from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class IntentResult:
    strategy: str
    connectors: list[str]
    tools: list[str]
    reasoning: str


class IntentClassifier:
    """Keyword-based intent classifier that maps user queries to retrieval strategies."""

    STRATEGIES: dict[str, dict] = {
        "graph": {
            "triggers": [
                "who", "analyst", "assigned", "connected", "related to",
                "investor", "relationship", "conflict", "overlap",
                "board", "competitor", "partner",
            ],
            "tools": ["graph_get_relationships", "backstop_get_company", "backstop_list_deals"],
            "connectors": ["Neo4j Graph", "Backstop CRM"],
        },
        "structured": {
            "triggers": [
                "irr", "arr", "revenue", "growth", "rank", "list all",
                "compare", "average", "total", "portfolio",
                "sector exposure", "mandate", "valuation", "calculate",
            ],
            "tools": ["snowflake_portfolio_overlap", "backstop_list_deals"],
            "connectors": ["Snowflake", "Backstop CRM"],
        },
        "vector": {
            "triggers": [
                "similar", "like", "find deals", "memo", "document",
                "risk factors", "analysis", "summarize", "what happened",
                "pitch deck", "due diligence",
            ],
            "tools": ["retrieval_search", "backstop_get_deal", "backstop_list_deals"],
            "connectors": ["Pinecone", "Backstop CRM"],
        },
        "lookup": {
            "triggers": [
                "get deal", "show me", "details of", "tell me about",
                "what is", "status", "stage", "info",
            ],
            "tools": [
                "backstop_get_deal", "backstop_get_company",
                "backstop_list_deals", "files_list_deal_files",
            ],
            "connectors": ["Backstop CRM", "File Server"],
        },
    }

    _DEAL_ID_PATTERN = re.compile(r"DEAL-\d+", re.IGNORECASE)

    def classify(self, query: str) -> IntentResult:
        query_lower = query.lower()
        matched: list[str] = []

        for name, cfg in self.STRATEGIES.items():
            if any(trigger in query_lower for trigger in cfg["triggers"]):
                matched.append(name)

        # Deal ID in query → ensure lookup is included
        if self._DEAL_ID_PATTERN.search(query):
            if "lookup" not in matched:
                matched.append("lookup")

        # No match → default to lookup
        if not matched:
            cfg = self.STRATEGIES["lookup"]
            return IntentResult(
                strategy="lookup",
                connectors=cfg["connectors"],
                tools=cfg["tools"],
                reasoning="No specific intent detected, defaulting to lookup",
            )

        # Single strategy
        if len(matched) == 1:
            name = matched[0]
            cfg = self.STRATEGIES[name]
            triggers_found = [t for t in cfg["triggers"] if t in query_lower]
            return IntentResult(
                strategy=name,
                connectors=cfg["connectors"],
                tools=cfg["tools"],
                reasoning=f"Matched {name} strategy via keywords: {triggers_found}",
            )

        # Multiple strategies → hybrid
        all_tools: list[str] = []
        all_connectors: list[str] = []
        for name in matched:
            cfg = self.STRATEGIES[name]
            all_tools.extend(cfg["tools"])
            all_connectors.extend(cfg["connectors"])

        return IntentResult(
            strategy="hybrid",
            connectors=sorted(set(all_connectors)),
            tools=sorted(set(all_tools)),
            reasoning=f"Multi-strategy query spanning: {matched}",
        )
