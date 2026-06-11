from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Rialto", streamable_http_path="/")

from mcp_server.tools.backstop_tools import register_tools as register_backstop
from mcp_server.tools.graph_tools import register_tools as register_graph
from mcp_server.tools.snowflake_tools import register_tools as register_snowflake
from mcp_server.tools.retrieval_tools import register_tools as register_retrieval
from mcp_server.tools.files_tools import register_tools as register_files
from mcp_server.tools.policy_tools import register_tools as register_policy

register_backstop(mcp)
register_graph(mcp)
register_snowflake(mcp)
register_retrieval(mcp)
register_files(mcp)
register_policy(mcp)
