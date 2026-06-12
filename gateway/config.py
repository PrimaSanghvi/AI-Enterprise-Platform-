import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8000/mcp")
ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929"
GATEWAY_PORT = int(os.getenv("PORT", "3000"))
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173",
).split(",")

# --- Login module ---
# Google OAuth client ID used to verify ID tokens from the browser.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
# Secret used to sign our own session tokens. MUST be set in production.
SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-insecure-session-secret-change-me")
# How long a user may access the system from their first login, in hours.
ACCESS_WINDOW_HOURS = float(os.getenv("ACCESS_WINDOW_HOURS", "2"))

# --- Service-to-service / hardening ---
# Shared secret the gateway's internal MCP client presents to the protected /mcp
# mount (alongside a session token). MUST be set in production.
MCP_INTERNAL_TOKEN = os.getenv("MCP_INTERNAL_TOKEN", "")
# Role permitted to mutate policy rules.
POLICY_ADMIN_ROLE = os.getenv("POLICY_ADMIN_ROLE", "Platform Admin")
# Per-user rate limit for agent endpoints: max requests per window (seconds).
AGENT_RATE_LIMIT = int(os.getenv("AGENT_RATE_LIMIT", "20"))
AGENT_RATE_WINDOW = float(os.getenv("AGENT_RATE_WINDOW", "60"))
