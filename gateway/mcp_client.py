from __future__ import annotations

import logging
from contextlib import AsyncExitStack

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.exceptions import McpError

logger = logging.getLogger(__name__)


class MCPClient:
    """Wrapper around the MCP Python SDK for connecting to a Streamable HTTP server."""

    def __init__(self, server_url: str):
        self._server_url = server_url
        self._session: ClientSession | None = None
        self._exit_stack: AsyncExitStack | None = None
        self._name_map: dict[str, str] = {}  # anthropic_name → mcp_name

    async def connect(self):
        """Open the transport and initialise the MCP session."""
        stack = AsyncExitStack()
        await stack.__aenter__()
        read_stream, write_stream, _ = await stack.enter_async_context(
            streamable_http_client(self._server_url)
        )
        session = await stack.enter_async_context(
            ClientSession(read_stream, write_stream)
        )
        await session.initialize()
        self._session = session
        self._exit_stack = stack

    async def reconnect(self):
        """Tear down the old session and open a fresh one."""
        logger.warning("MCP session lost, reconnecting to %s", self._server_url)
        await self.disconnect()
        await self.connect()

    async def disconnect(self):
        """Tear down session and transport in reverse order."""
        if self._exit_stack:
            try:
                await self._exit_stack.aclose()
            except Exception:
                pass
            self._exit_stack = None
            self._session = None

    async def list_tools(self) -> list[dict]:
        """Return MCP tools converted to Anthropic API tool format."""
        try:
            result = await self._session.list_tools()
        except (McpError, Exception):
            await self.reconnect()
            result = await self._session.list_tools()
        tools = []
        for tool in result.tools:
            safe_name = tool.name.replace(".", "_")
            self._name_map[safe_name] = tool.name
            tools.append({
                "name": safe_name,
                "description": tool.description or "",
                "input_schema": tool.inputSchema,
            })
        return tools

    async def call_tool(self, name: str, arguments: dict | None = None) -> str:
        """Call an MCP tool and return the text result."""
        mcp_name = self._name_map.get(name, name)
        try:
            result = await self._session.call_tool(mcp_name, arguments or {})
        except (McpError, Exception):
            await self.reconnect()
            result = await self._session.call_tool(mcp_name, arguments or {})
        if result.isError:
            return f"ERROR: {result.content[0].text}"
        return result.content[0].text
