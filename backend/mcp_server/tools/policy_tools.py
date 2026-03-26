import json

from mcp.server.fastmcp import FastMCP

from backend.connectors import policy


def register_tools(mcp: FastMCP):
    @mcp.tool(name="policy.list_rules")
    def list_rules(role: str = "", connector: str = "") -> str:
        """List all policy rules. Optionally filter by role and/or connector name."""
        rules = policy.list_rules(role=role, connector=connector)
        return json.dumps(rules)

    @mcp.tool(name="policy.get_rule")
    def get_rule(rule_id: str) -> str:
        """Get a single policy rule by its ID (e.g. POL-001)."""
        rule = policy.get_rule(rule_id)
        if not rule:
            return json.dumps({"error": f"Rule {rule_id} not found"})
        return json.dumps(rule)

    @mcp.tool(name="policy.create_rule")
    def create_rule(
        role: str,
        connector: str,
        operations: str,
        field_restrictions: str = "",
        description: str = "",
        enabled: bool = True,
    ) -> str:
        """Create a new policy rule. Operations and field_restrictions are comma-separated strings (e.g. 'Read,Search,Write')."""
        ops = [op.strip() for op in operations.split(",") if op.strip()]
        restrictions = [f.strip() for f in field_restrictions.split(",") if f.strip()]
        rule = policy.create_rule(
            role=role,
            connector=connector,
            operations=ops,
            field_restrictions=restrictions,
            description=description,
            enabled=enabled,
        )
        return json.dumps(rule)

    @mcp.tool(name="policy.update_rule")
    def update_rule(rule_id: str, enabled: bool | None = None, operations: str = "") -> str:
        """Update a policy rule. Pass enabled=true/false to toggle, or operations as comma-separated string to change allowed operations."""
        updates: dict = {}
        if enabled is not None:
            updates["enabled"] = enabled
        if operations:
            updates["operations"] = [op.strip() for op in operations.split(",") if op.strip()]
        if not updates:
            return json.dumps({"error": "No valid updates provided"})
        result = policy.update_rule(rule_id, updates)
        if not result:
            return json.dumps({"error": f"Rule {rule_id} not found"})
        return json.dumps(result)

    @mcp.tool(name="policy.delete_rule")
    def delete_rule(rule_id: str) -> str:
        """Delete a policy rule by its ID."""
        deleted = policy.delete_rule(rule_id)
        if not deleted:
            return json.dumps({"error": f"Rule {rule_id} not found"})
        return json.dumps({"status": "deleted", "rule_id": rule_id})

    @mcp.tool(name="policy.evaluate")
    def evaluate(role: str, connector: str, operation: str, fields: str = "") -> str:
        """Evaluate whether a role is authorized to perform an operation on a connector. Returns allow/deny decision with detailed reasoning trace. Fields is an optional comma-separated list of requested data fields."""
        field_list = [f.strip() for f in fields.split(",") if f.strip()] if fields else None
        result = policy.evaluate(role=role, connector=connector, operation=operation, fields=field_list)
        return json.dumps(result)
