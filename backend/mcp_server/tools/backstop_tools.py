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

    @mcp.tool(name="backstop.create_company_stub")
    def create_company_stub(
        name: str,
        sector: str,
        stage: str,
        company_id: str | None = None,
    ) -> str:
        """Create a minimal company record. Used when a new deal references a company not yet in the CRM."""
        try:
            company = backstop.create_company_stub(name=name, sector=sector, stage=stage, company_id=company_id)
            return json.dumps(company)
        except Exception as exc:
            return json.dumps({"error": str(exc)})

    @mcp.tool(name="backstop.create_deal")
    def create_deal(
        company_name: str,
        sector: str,
        stage: str,
        status: str,
        ask_amount: int,
        valuation: int,
        company_id: str | None = None,
        deal_id: str | None = None,
        source: str | None = None,
        lead_partner: str | None = None,
        date_received: str | None = None,
    ) -> str:
        """Create a new deal in the pipeline. Required: company_name, sector, stage, status, ask_amount, valuation. Returns the persisted deal JSON."""
        payload = {
            "company_name": company_name,
            "sector": sector,
            "stage": stage,
            "status": status,
            "ask_amount": ask_amount,
            "valuation": valuation,
            "company_id": company_id,
            "deal_id": deal_id,
            "source": source,
            "lead_partner": lead_partner,
            "date_received": date_received,
        }
        try:
            deal = backstop.create_deal(payload)
            return json.dumps(deal)
        except ValueError as exc:
            return json.dumps({"error": str(exc)})
