import json

from mcp.server.fastmcp import FastMCP

from backend.connectors import snowflake


def register_tools(mcp: FastMCP):
    @mcp.tool(name="snowflake.portfolio_overlap")
    def portfolio_overlap(sector: str) -> str:
        """Analyze portfolio overlap for a given sector. Returns overlap scores and details for companies in that sector."""
        data = snowflake.portfolio_overlap(sector)
        if not data:
            return json.dumps({"error": f"No portfolio overlap data found for sector '{sector}'"})
        return json.dumps(data)
