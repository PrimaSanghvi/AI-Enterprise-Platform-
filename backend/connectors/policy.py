"""Policy Engine connector — RBAC rule management and policy evaluation."""

import json
from datetime import datetime, timezone

from backend.db import SCHEMA, execute, query

DISPLAY_NAME = "Policy Engine"

ROLES = ["Analyst", "Senior Analyst", "Platform Admin"]
CONNECTORS = ["Backstop CRM", "File Server", "Neo4j Graph", "Snowflake", "Pinecone", "Appian"]
OPERATIONS = ["Read", "Search", "Write", "Action"]


def _row_to_rule(row: dict) -> dict:
    """Convert DB snake_case columns to the camelCase shape expected by callers."""
    return {
        "id": row["id"],
        "role": row["role"],
        "connector": row["connector"],
        "operations": row["operations"] or [],
        "fieldRestrictions": row["field_restrictions"] or [],
        "rowFilters": row["row_filters"] or {},
        "enabled": row["enabled"],
        "description": row["description"] or "",
        "createdAt": row["created_at"] or "",
    }


def list_rules(role: str = "", connector: str = "") -> list[dict]:
    sql = f"SELECT * FROM {SCHEMA}.policy_rules WHERE 1=1"
    params: list = []
    if role:
        sql += " AND role = %s"
        params.append(role)
    if connector:
        sql += " AND connector = %s"
        params.append(connector)
    return [_row_to_rule(r) for r in query(sql, params if params else None)]


def get_rule(rule_id: str) -> dict | None:
    rows = query(f"SELECT * FROM {SCHEMA}.policy_rules WHERE id = %s", (rule_id,))
    return _row_to_rule(rows[0]) if rows else None


def create_rule(
    role: str,
    connector: str,
    operations: list[str],
    field_restrictions: list[str] | None = None,
    row_filters: dict | None = None,
    description: str = "",
    enabled: bool = True,
) -> dict:
    rows = query(f"SELECT id FROM {SCHEMA}.policy_rules ORDER BY id")
    existing_nums = []
    for r in rows:
        try:
            existing_nums.append(int(r["id"].split("-")[1]))
        except (IndexError, ValueError):
            pass
    next_num = max(existing_nums, default=0) + 1
    rule_id = f"POL-{next_num:03d}"

    execute(
        f"""
        INSERT INTO {SCHEMA}.policy_rules
            (id, role, connector, operations, field_restrictions, row_filters, enabled, description, created_at)
        VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s)
        """,
        (
            rule_id, role, connector,
            [op for op in operations if op in OPERATIONS],
            field_restrictions or [],
            json.dumps(row_filters or {}),
            enabled, description,
            datetime.now(timezone.utc),
        ),
    )
    return get_rule(rule_id)


def update_rule(rule_id: str, updates: dict) -> dict | None:
    KEY_MAP = {
        "role": "role",
        "connector": "connector",
        "operations": "operations",
        "fieldRestrictions": "field_restrictions",
        "rowFilters": "row_filters",
        "enabled": "enabled",
        "description": "description",
    }
    set_clauses = []
    params = []
    for key, value in updates.items():
        col = KEY_MAP.get(key)
        if col:
            if col == "row_filters":
                set_clauses.append(f"{col} = %s::jsonb")
                params.append(json.dumps(value))
            else:
                set_clauses.append(f"{col} = %s")
                params.append(value)
    if not set_clauses:
        return get_rule(rule_id)
    params.append(rule_id)
    execute(
        f"UPDATE {SCHEMA}.policy_rules SET {', '.join(set_clauses)} WHERE id = %s",
        params,
    )
    return get_rule(rule_id)


def delete_rule(rule_id: str) -> bool:
    rows = query(f"SELECT id FROM {SCHEMA}.policy_rules WHERE id = %s", (rule_id,))
    if not rows:
        return False
    execute(f"DELETE FROM {SCHEMA}.policy_rules WHERE id = %s", (rule_id,))
    return True


def evaluate(
    role: str,
    connector: str,
    operation: str,
    fields: list[str] | None = None,
) -> dict:
    """Evaluate a policy request and return an allow/deny decision with reasoning."""
    rules = list_rules()
    reasoning: list[dict] = []
    step = 0

    step += 1
    if role not in ROLES:
        reasoning.append({
            "step": step,
            "check": "Role validation",
            "result": f"Unknown role '{role}' — not in [{', '.join(ROLES)}]",
        })
        return {"decision": "Deny", "matchedRuleId": None, "maskedFields": [], "rowFilters": {}, "reasoning": reasoning}
    reasoning.append({"step": step, "check": "Role validation",
                      "result": f"Role '{role}' is a recognized platform role"})

    step += 1
    role_rules = [r for r in rules if r["role"] == role]
    reasoning.append({"step": step, "check": "Role rule lookup",
                      "result": f"Found {len(role_rules)} rule(s) for role '{role}'"})

    step += 1
    connector_rules = [r for r in role_rules if r["connector"] == connector]
    if not connector_rules:
        reasoning.append({"step": step, "check": "Connector match",
                          "result": f"No rules found for '{role}' on '{connector}' — access denied"})
        return {"decision": "Deny", "matchedRuleId": None, "maskedFields": [], "rowFilters": {}, "reasoning": reasoning}
    reasoning.append({"step": step, "check": "Connector match",
                      "result": f"Found {len(connector_rules)} rule(s) matching connector '{connector}'"})

    step += 1
    enabled_rules = [r for r in connector_rules if r.get("enabled", True)]
    if not enabled_rules:
        disabled_ids = [r["id"] for r in connector_rules]
        reasoning.append({"step": step, "check": "Rule status",
                          "result": f"Rule(s) {', '.join(disabled_ids)} exist but are disabled — access denied"})
        return {"decision": "Deny", "matchedRuleId": disabled_ids[0], "maskedFields": [], "rowFilters": {}, "reasoning": reasoning}

    matched_rule = enabled_rules[0]
    reasoning.append({"step": step, "check": "Rule status",
                      "result": f"Rule {matched_rule['id']} is active and enabled"})

    step += 1
    allowed_ops = matched_rule.get("operations", [])
    if operation not in allowed_ops:
        reasoning.append({"step": step, "check": "Operation authorization",
                          "result": f"Operation '{operation}' not in allowed operations [{', '.join(allowed_ops)}] — access denied"})
        return {"decision": "Deny", "matchedRuleId": matched_rule["id"], "maskedFields": [], "rowFilters": {}, "reasoning": reasoning}
    reasoning.append({"step": step, "check": "Operation authorization",
                      "result": f"Operation '{operation}' is permitted under rule {matched_rule['id']}"})

    step += 1
    masked_fields = matched_rule.get("fieldRestrictions", [])
    if masked_fields:
        reasoning.append({"step": step, "check": "Field-level restrictions",
                          "result": f"{len(masked_fields)} field(s) masked: {', '.join(masked_fields)}"})
    else:
        reasoning.append({"step": step, "check": "Field-level restrictions",
                          "result": "No field restrictions — full attribute visibility"})

    if fields and masked_fields:
        step += 1
        blocked = [f for f in fields if f in masked_fields]
        if blocked:
            reasoning.append({"step": step, "check": "Requested field check",
                              "result": f"Requested field(s) [{', '.join(blocked)}] are restricted and will be redacted from response"})
        else:
            reasoning.append({"step": step, "check": "Requested field check",
                              "result": "Requested fields do not overlap with restricted fields"})

    step += 1
    row_filters = matched_rule.get("rowFilters", {})
    if row_filters:
        filter_desc = "; ".join(f"{k} in [{', '.join(v)}]" for k, v in row_filters.items())
        reasoning.append({"step": step, "check": "Row-level filters",
                          "result": f"Data scoped by: {filter_desc}"})
    else:
        reasoning.append({"step": step, "check": "Row-level filters",
                          "result": "No row-level filters — full data access within connector scope"})

    step += 1
    reasoning.append({"step": step, "check": "Policy decision",
                      "result": f"ALLOW — authorized by rule {matched_rule['id']}: {matched_rule.get('description', '')}"})

    return {
        "decision": "Allow",
        "matchedRuleId": matched_rule["id"],
        "maskedFields": masked_fields,
        "rowFilters": row_filters,
        "reasoning": reasoning,
    }
