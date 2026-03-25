"""Generate realistic audit logs from fixture data."""

import hashlib
import json
import random
from datetime import datetime, timedelta
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"

DISPLAY_NAME = "Audit Logs"


def _load(filename: str) -> dict | list:
    with open(FIXTURES_DIR / filename) as f:
        return json.load(f)


# Deterministic seed so the same logs are generated every time
random.seed(42)

# Human analysts extracted from deals fixture
ANALYSTS = ["Sarah Chen", "James Park", "Priya Sharma", "Marcus Rivera"]

# System users
SYSTEM_USERS = ["Triage Agent", "RAG Indexer", "Graph Sync"]

# External (deny) scenarios
EXTERNAL_USERS = [
    "Unknown IP 203.0.113.42",
    "External API (unverified)",
    "External Script",
]

DENY_SCENARIOS = [
    {
        "reason": "Unrecognized principal — no valid JWT",
        "policy_rule": "AUTH-001",
    },
    {
        "reason": "Rate limit exceeded — 100 req/s threshold",
        "policy_rule": "RATE-002",
    },
    {
        "reason": "PII data detected — write blocked by DLP policy",
        "policy_rule": "DLP-003",
    },
    {
        "reason": "Insufficient role permissions for write operation",
        "policy_rule": "RBAC-004",
    },
]


def _stable_latency(seed_str: str, base: int, spread: int) -> int:
    """Generate a deterministic latency from a seed string."""
    h = int(hashlib.md5(seed_str.encode()).hexdigest()[:8], 16)
    return base + (h % spread)


def generate_audit_logs() -> list[dict]:
    """Build audit log entries from all fixture data."""
    deals = _load("deals.json")
    companies = {c["company_id"]: c for c in _load("companies.json")}
    files = _load("deal_files.json")
    relationships: dict = _load("relationships.json")
    documents = _load("documents.json")

    # Build deal lookup
    deal_map = {}
    for d in deals:
        deal_map[d["deal_id"]] = d

    # Build company-to-deal mapping
    company_to_deal = {}
    for d in deals:
        company_to_deal[d["company_id"]] = d

    logs: list[dict] = []
    log_id = 0

    # Base time: today at 14:30
    base_time = datetime.now().replace(hour=14, minute=30, second=0, microsecond=0)

    def next_id() -> str:
        nonlocal log_id
        log_id += 1
        return f"audit-{log_id:04d}"

    def add_log(
        offset_seconds: int,
        user: str,
        user_type: str,
        connector: str,
        operation: str,
        resource: str,
        deal_ref: str | None = None,
        latency_ms: int | None = None,
        decision: str = "Allow",
        reason: str | None = None,
        policy_rule: str | None = None,
    ):
        ts = base_time - timedelta(seconds=offset_seconds)
        logs.append(
            {
                "id": next_id(),
                "timestamp": ts.strftime("%H:%M:%S"),
                "date": ts.strftime("%b %d"),
                "user": user,
                "userType": user_type,
                "connector": connector,
                "operation": operation,
                "resource": resource,
                "dealRef": deal_ref,
                "latencyMs": latency_ms,
                "decision": decision,
                "reason": reason,
                "policyRule": policy_rule,
            }
        )

    offset = 0

    # ── 1. Generate logs from triage results ──
    for deal in deals:
        company_name = deal["company_name"]
        deal_id = deal["deal_id"]
        company_id = deal["company_id"]

        for triage in deal.get("triage_results", []):
            analyst = triage["analyst"]

            # Triage Agent reads deal from Backstop CRM
            add_log(
                offset,
                "Triage Agent",
                "system",
                "Backstop CRM",
                "Read",
                f"Deal record — {company_name}",
                deal_id,
                _stable_latency(f"backstop-read-{deal_id}", 80, 200),
            )
            offset += 15

            # Triage Agent searches Pinecone for context
            add_log(
                offset,
                "Triage Agent",
                "system",
                "Pinecone",
                "Search",
                f"Semantic search: '{company_name} investment thesis'",
                deal_id,
                _stable_latency(f"pinecone-search-{deal_id}", 40, 100),
            )
            offset += 8

            # Triage Agent queries Neo4j for relationships
            if company_id in relationships:
                rels = relationships[company_id]["relationships"]
                rel_types = list({r["type"] for r in rels})
                add_log(
                    offset,
                    "Triage Agent",
                    "system",
                    "Neo4j Graph",
                    "Search",
                    f"Entity graph: {', '.join(rel_types)} for {company_name}",
                    deal_id,
                    _stable_latency(f"neo4j-{deal_id}", 120, 200),
                )
                offset += 12

            # Analyst writes triage result
            add_log(
                offset,
                analyst,
                "human",
                "Backstop CRM",
                "Write",
                f"Triage decision: {triage['decision']} — {company_name}",
                deal_id,
                _stable_latency(f"triage-write-{deal_id}-{analyst}", 60, 120),
            )
            offset += 20

    # ── 2. Generate logs from deal files ──
    for f in files:
        deal_id = f["deal_id"]
        deal = deal_map.get(deal_id)
        if not deal:
            continue

        company_name = deal["company_name"]
        analyst = random.choice(ANALYSTS)

        # Upload / read file
        is_upload = f["file_type"] in ("pitch_deck", "legal")
        add_log(
            offset,
            analyst,
            "human",
            "File Server",
            "Write" if is_upload else "Read",
            f"{'Upload' if is_upload else 'Download'}: {f['filename']}",
            deal_id,
            _stable_latency(f"file-{f['file_id']}", 30, 120),
        )
        offset += 10

        # RAG Indexer processes uploaded documents
        if f["filename"].endswith(".pdf"):
            # Count chunks for this deal
            deal_chunks = [c for c in documents if c["deal_id"] == deal_id]
            chunk_count = len(deal_chunks)
            if chunk_count > 0:
                add_log(
                    offset,
                    "RAG Indexer",
                    "system",
                    "Pinecone",
                    "Write",
                    f"Upsert {chunk_count} embeddings — {f['filename']}",
                    deal_id,
                    _stable_latency(f"rag-{f['file_id']}", 150, 300),
                )
                offset += 7

    # ── 3. Generate logs from relationship queries ──
    for company_id, rel_data in relationships.items():
        company = companies.get(company_id)
        if not company:
            continue

        analyst = random.choice(ANALYSTS)

        # Analyst explores graph
        investors = [
            r["name"] for r in rel_data["relationships"] if r["type"] == "investor"
        ]
        if investors:
            add_log(
                offset,
                analyst,
                "human",
                "Neo4j Graph",
                "Search",
                f"Traverse: {investors[0]} → portfolio relationships",
                company_to_deal.get(company_id, {}).get("deal_id"),
                _stable_latency(f"graph-traverse-{company_id}", 100, 200),
            )
            offset += 18

    # ── 4. Generate Snowflake financial queries ──
    for deal in deals:
        analyst = deal.get("lead_partner", random.choice(ANALYSTS))
        add_log(
            offset,
            analyst,
            "human",
            "Snowflake",
            "Read",
            f"Financial metrics — {deal['company_name']} ({deal['sector']})",
            deal["deal_id"],
            _stable_latency(f"snowflake-{deal['deal_id']}", 400, 1800),
        )
        offset += 25

    # ── 5. Sprinkle in deny entries ──
    deny_entries = [
        {
            "user": "Unknown IP 203.0.113.42",
            "connector": "Backstop CRM",
            "operation": "Write",
            "resource": "Attempted write: Deal record — AeroCarbon",
            "deal_ref": "DEAL-008",
            "scenario": DENY_SCENARIOS[0],
        },
        {
            "user": "External API (unverified)",
            "connector": "Snowflake",
            "operation": "Read",
            "resource": "Attempted read: full portfolio summary",
            "deal_ref": None,
            "scenario": DENY_SCENARIOS[1],
        },
        {
            "user": "External Script",
            "connector": "File Server",
            "operation": "Write",
            "resource": "Attempted bulk upload to /restricted/",
            "deal_ref": None,
            "scenario": DENY_SCENARIOS[2],
        },
        {
            "user": "Unknown IP 198.51.100.7",
            "connector": "Neo4j Graph",
            "operation": "Read",
            "resource": "Attempted graph export: all entities",
            "deal_ref": None,
            "scenario": DENY_SCENARIOS[3],
        },
    ]

    for deny in deny_entries:
        offset += 35
        add_log(
            offset,
            deny["user"],
            "external",
            deny["connector"],
            deny["operation"],
            deny["resource"],
            deny["deal_ref"],
            None,
            "Deny",
            deny["scenario"]["reason"],
            deny["scenario"]["policy_rule"],
        )

    # Sort by timestamp descending (most recent first = smallest offset first)
    # logs are already in offset order, just return them
    return logs
