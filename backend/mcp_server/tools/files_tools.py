import json

from mcp.server.fastmcp import FastMCP

from backend.connectors import files


def register_tools(mcp: FastMCP):
    @mcp.tool(name="files.list_deal_files")
    def list_deal_files(deal_id: str) -> str:
        """List all files associated with a deal. Returns file metadata including name, type, size, and upload date."""
        data = files.list_deal_files(deal_id)
        if not data:
            return json.dumps({"error": f"No files found for deal {deal_id}"})
        return json.dumps(data)
