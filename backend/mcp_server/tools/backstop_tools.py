import json

from mcp.server.fastmcp import FastMCP

from backend.connectors import backstop


def register_tools(mcp: FastMCP):
    @mcp.tool(name="backstop.get_deal")
    def get_deal(deal_id: str) -> str:
        """Get details for a specific deal by ID. Returns deal metadata, status, and triage history."""
        deal = backstop.get_deal(deal_id)
        if not deal:
            return json.dumps({"error": f"Deal {deal_id} not found"})
        return json.dumps(deal)

    @mcp.tool(name="backstop.get_company")
    def get_company(company_id: str) -> str:
        """Get company profile by ID. Returns sector, stage, description, and founding details."""
        company = backstop.get_company(company_id)
        if not company:
            return json.dumps({"error": f"Company {company_id} not found"})
        return json.dumps(company)

    @mcp.tool(name="backstop.list_deals")
    def list_deals() -> str:
        """List all deals in the pipeline. Returns an array of deal objects with status and metadata."""
        deals = backstop.list_deals()
        return json.dumps(deals)

    @mcp.tool(name="backstop.write_triage_result")
    def write_triage_result(
        deal_id: str,
        decision: str,
        rationale: str,
        analyst: str = "AI Analyst",
        connectors_used: list[str] | None = None,
    ) -> str:
        """Write a triage result for a deal. Decision must be 'pass', 'advance', or 'hold'. Returns the updated deal."""
        if decision not in ("pass", "advance", "hold"):
            return json.dumps({"error": f"Invalid decision '{decision}'. Must be 'pass', 'advance', or 'hold'."})
        result = backstop.write_triage_result(deal_id, decision, rationale, analyst, connectors_used=connectors_used)
        if not result:
            return json.dumps({"error": f"Deal {deal_id} not found"})
        return json.dumps(result)
