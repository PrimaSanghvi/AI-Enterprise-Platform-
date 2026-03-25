import json

from mcp.server.fastmcp import FastMCP

from backend.connectors import graph


def register_tools(mcp: FastMCP):
    @mcp.tool(name="graph.get_relationships")
    def get_relationships(company_id: str) -> str:
        """Get relationships for a company including investors, board members, competitors, and partners."""
        data = graph.get_relationships(company_id)
        if not data:
            return json.dumps({"error": f"No relationships found for company {company_id}"})
        return json.dumps(data)
