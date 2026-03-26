"""Policy Engine connector — RBAC rule management and policy evaluation."""

import json
from datetime import datetime, timezone
from pathlib import Path

DISPLAY_NAME = "Policy Engine"

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"

ROLES = ["Analyst", "Senior Analyst", "Platform Admin"]
CONNECTORS = ["Backstop CRM", "File Server", "Neo4j Graph", "Snowflake", "Pinecone", "Appian"]
OPERATIONS = ["Read", "Search", "Write", "Action"]


def _load(filename: str) -> list | dict:
    with open(FIXTURES_DIR / filename) as f:
        return json.load(f)


def _save(filename: str, data: list | dict) -> None:
    with open(FIXTURES_DIR / filename, "w") as f:
        json.dump(data, f, indent=2)


def list_rules(role: str = "", connector: str = "") -> list[dict]:
    """Return all policy rules, optionally filtered by role and/or connector."""
    rules = _load("policy_rules.json")
    if role:
        rules = [r for r in rules if r["role"] == role]
    if connector:
        rules = [r for r in rules if r["connector"] == connector]
    return rules


def get_rule(rule_id: str) -> dict | None:
    """Return a single policy rule by ID."""
    rules = _load("policy_rules.json")
    for rule in rules:
        if rule["id"] == rule_id:
            return rule
    return None


def create_rule(
    role: str,
    connector: str,
    operations: list[str],
    field_restrictions: list[str] | None = None,
    row_filters: dict | None = None,
    description: str = "",
    enabled: bool = True,
) -> dict:
    """Create a new policy rule and persist it."""
    rules = _load("policy_rules.json")

    # Generate next ID
    existing_nums = []
    for r in rules:
        try:
            existing_nums.append(int(r["id"].split("-")[1]))
        except (IndexError, ValueError):
            pass
    next_num = max(existing_nums, default=0) + 1

    rule = {
        "id": f"POL-{next_num:03d}",
        "role": role,
        "connector": connector,
        "operations": [op for op in operations if op in OPERATIONS],
        "fieldRestrictions": field_restrictions or [],
        "rowFilters": row_filters or {},
        "enabled": enabled,
        "description": description,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }

    rules.append(rule)
    _save("policy_rules.json", rules)
    return rule


def update_rule(rule_id: str, updates: dict) -> dict | None:
    """Update an existing policy rule. Returns the updated rule or None."""
    rules = _load("policy_rules.json")
    for rule in rules:
        if rule["id"] == rule_id:
            allowed_keys = {
                "role", "connector", "operations", "fieldRestrictions",
                "rowFilters", "enabled", "description",
            }
            for key, value in updates.items():
                if key in allowed_keys:
                    rule[key] = value
            _save("policy_rules.json", rules)
            return rule
    return None


def delete_rule(rule_id: str) -> bool:
    """Delete a policy rule by ID. Returns True if deleted."""
    rules = _load("policy_rules.json")
    original_len = len(rules)
    rules = [r for r in rules if r["id"] != rule_id]
    if len(rules) < original_len:
        _save("policy_rules.json", rules)
        return True
    return False


def evaluate(
    role: str,
    connector: str,
    operation: str,
    fields: list[str] | None = None,
) -> dict:
    """Evaluate a policy request and return an allow/deny decision with reasoning.

    This implements the LLD Section 6.3.3 Policy Engine:
    - Inputs: user role, connector, operation, optional field list
    - Outputs: decision, masked fields, row filters, reasoning trace
    """
    rules = _load("policy_rules.json")
    reasoning: list[dict] = []
    step = 0

    # Step 1: Validate inputs
    step += 1
    if role not in ROLES:
        reasoning.append({
            "step": step,
            "check": "Role validation",
            "result": f"Unknown role '{role}' — not in [{', '.join(ROLES)}]",
        })
        return {
            "decision": "Deny",
            "matchedRuleId": None,
            "maskedFields": [],
            "rowFilters": {},
            "reasoning": reasoning,
        }
    reasoning.append({
        "step": step,
        "check": "Role validation",
        "result": f"Role '{role}' is a recognized platform role",
    })

    # Step 2: Find all rules for this role
    step += 1
    role_rules = [r for r in rules if r["role"] == role]
    reasoning.append({
        "step": step,
        "check": "Role rule lookup",
        "result": f"Found {len(role_rules)} rule(s) for role '{role}'",
    })

    # Step 3: Filter to matching connector
    step += 1
    connector_rules = [r for r in role_rules if r["connector"] == connector]
    if not connector_rules:
        reasoning.append({
            "step": step,
            "check": "Connector match",
            "result": f"No rules found for '{role}' on '{connector}' — access denied",
        })
        return {
            "decision": "Deny",
            "matchedRuleId": None,
            "maskedFields": [],
            "rowFilters": {},
            "reasoning": reasoning,
        }
    reasoning.append({
        "step": step,
        "check": "Connector match",
        "result": f"Found {len(connector_rules)} rule(s) matching connector '{connector}'",
    })

    # Step 4: Check if rule is enabled
    step += 1
    enabled_rules = [r for r in connector_rules if r.get("enabled", True)]
    if not enabled_rules:
        disabled_ids = [r["id"] for r in connector_rules]
        reasoning.append({
            "step": step,
            "check": "Rule status",
            "result": f"Rule(s) {', '.join(disabled_ids)} exist but are disabled — access denied",
        })
        return {
            "decision": "Deny",
            "matchedRuleId": disabled_ids[0],
            "maskedFields": [],
            "rowFilters": {},
            "reasoning": reasoning,
        }

    matched_rule = enabled_rules[0]
    reasoning.append({
        "step": step,
        "check": "Rule status",
        "result": f"Rule {matched_rule['id']} is active and enabled",
    })

    # Step 5: Check operation permission
    step += 1
    allowed_ops = matched_rule.get("operations", [])
    if operation not in allowed_ops:
        reasoning.append({
            "step": step,
            "check": "Operation authorization",
            "result": f"Operation '{operation}' not in allowed operations [{', '.join(allowed_ops)}] — access denied",
        })
        return {
            "decision": "Deny",
            "matchedRuleId": matched_rule["id"],
            "maskedFields": [],
            "rowFilters": {},
            "reasoning": reasoning,
        }
    reasoning.append({
        "step": step,
        "check": "Operation authorization",
        "result": f"Operation '{operation}' is permitted under rule {matched_rule['id']}",
    })

    # Step 6: Evaluate field restrictions
    step += 1
    masked_fields = matched_rule.get("fieldRestrictions", [])
    if masked_fields:
        reasoning.append({
            "step": step,
            "check": "Field-level restrictions",
            "result": f"{len(masked_fields)} field(s) masked: {', '.join(masked_fields)}",
        })
    else:
        reasoning.append({
            "step": step,
            "check": "Field-level restrictions",
            "result": "No field restrictions — full attribute visibility",
        })

    # Step 7: Check if requested fields conflict with restrictions
    if fields and masked_fields:
        step += 1
        blocked = [f for f in fields if f in masked_fields]
        if blocked:
            reasoning.append({
                "step": step,
                "check": "Requested field check",
                "result": f"Requested field(s) [{', '.join(blocked)}] are restricted and will be redacted from response",
            })
        else:
            reasoning.append({
                "step": step,
                "check": "Requested field check",
                "result": "Requested fields do not overlap with restricted fields",
            })

    # Step 8: Evaluate row filters
    step += 1
    row_filters = matched_rule.get("rowFilters", {})
    if row_filters:
        filter_desc = "; ".join(f"{k} in [{', '.join(v)}]" for k, v in row_filters.items())
        reasoning.append({
            "step": step,
            "check": "Row-level filters",
            "result": f"Data scoped by: {filter_desc}",
        })
    else:
        reasoning.append({
            "step": step,
            "check": "Row-level filters",
            "result": "No row-level filters — full data access within connector scope",
        })

    # Final decision
    step += 1
    reasoning.append({
        "step": step,
        "check": "Policy decision",
        "result": f"ALLOW — authorized by rule {matched_rule['id']}: {matched_rule.get('description', '')}",
    })

    return {
        "decision": "Allow",
        "matchedRuleId": matched_rule["id"],
        "maskedFields": masked_fields,
        "rowFilters": row_filters,
        "reasoning": reasoning,
    }
