from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Rialto", streamable_http_path="/")

from backend.mcp_server.tools.backstop_tools import register_tools as register_backstop
from backend.mcp_server.tools.graph_tools import register_tools as register_graph
from backend.mcp_server.tools.snowflake_tools import register_tools as register_snowflake
from backend.mcp_server.tools.retrieval_tools import register_tools as register_retrieval
from backend.mcp_server.tools.files_tools import register_tools as register_files

register_backstop(mcp)
register_graph(mcp)
register_snowflake(mcp)
register_retrieval(mcp)
register_files(mcp)
