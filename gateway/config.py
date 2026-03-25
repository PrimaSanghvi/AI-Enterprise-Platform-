import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8000/mcp")
ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929"
LLM_ENDPOINT = os.getenv("LLM_ENDPOINT", "http://34.123.31.83:8080/completion")
GATEWAY_PORT = int(os.getenv("PORT", "3000"))
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173",
).split(",")
