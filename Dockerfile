# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

# Single-container deploy: the gateway serves this SPA, so API calls must be
# same-origin. Empty VITE_API_BASE makes the client use relative paths (e.g.
# fetch("/deals")) instead of the dev default http://localhost:3000. Override
# only if the API is hosted on a separate origin.
ARG VITE_API_BASE=""
ENV VITE_API_BASE=${VITE_API_BASE}

# NOTE: the Google client ID is NOT baked at build time. The SPA fetches it at
# RUNTIME from the gateway's GET /auth/config, driven by the GOOGLE_CLIENT_ID env
# var on the running container — so no VITE_GOOGLE_CLIENT_ID build arg is needed
# and the same image works in any environment.

RUN npm run build


# ── Stage 2: Install backend deps ─────────────────────────────────────────────
FROM python:3.12-slim AS backend-builder

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt


# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Copy installed Python packages from builder (avoids re-downloading in prod)
COPY --from=backend-builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=backend-builder /usr/local/bin /usr/local/bin

# Backend source (becomes top-level modules: mcp_server, security, connectors, rag, …)
COPY backend/ ./
COPY gateway/ ./gateway/

# Built frontend — the gateway serves it via StaticFiles from ../frontend/dist
# (relative to gateway/app.py), i.e. /app/frontend/dist. Copy it there.
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# ── Hardcoded production config (never put in GCP Secrets) ───────────────────
# Seeds data on first startup; skips if rows already exist (idempotent)
ENV AUTO_SEED=true
# SMTP for OTP emails (SMTP_USER, SMTP_PASS, and SMTP_FROM must be injected
# as secrets). SMTP_USER/SMTP_PASS are only the auth credential pair; SMTP_FROM
# is the no-reply address emails are actually sent from.
ENV SMTP_HOST=smtp.gmail.com
ENV SMTP_PORT=587

EXPOSE 8080

# GCP Secrets injected at runtime by Cloud Run:
#   DATABASE_URL, DB_SCHEMA, GOOGLE_CLIENT_ID, JWT_SECRET,
#   ANTHROPIC_API_KEY, ANTHROPIC_MODEL_ID
#
# Cloud Run injects PORT; we default to 8080. Run the GATEWAY (public entrypoint:
# serves the SPA, login/auth, and proxies to the backend via in-process MCP) —
# NOT backend/main.py, which is internal-only and rejects all tokenless requests.
# GATEWAY_PORT reads PORT, so the in-process MCP client targets this same port.
CMD ["sh", "-c", "uvicorn gateway.app:app --host 0.0.0.0 --port ${PORT:-8080}"]
