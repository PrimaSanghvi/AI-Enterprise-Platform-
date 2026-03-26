"""Connector registry — maps MCP tool prefixes to display names."""

from backend.connectors import backstop, files, graph, policy, snowflake

# Maps the tool-name prefix to the connector's display name.
# Built from each connector module's DISPLAY_NAME constant.
CONNECTOR_DISPLAY_NAMES: dict[str, str] = {
    "backstop": backstop.DISPLAY_NAME,
    "graph": graph.DISPLAY_NAME,
    "snowflake": snowflake.DISPLAY_NAME,
    "retrieval": files.RETRIEVAL_DISPLAY_NAME,
    "files": files.DISPLAY_NAME,
    "policy": policy.DISPLAY_NAME,
}
