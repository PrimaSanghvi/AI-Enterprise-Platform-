# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build the frontend
# VITE_GOOGLE_CLIENT_ID is baked into the JS bundle at build time.
# VITE_API_BASE is forced empty: the gateway serves the frontend from the same
# origin in this single container, so all API calls use relative paths.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend-build

ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_API_BASE=""

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Production image
# The Python gateway (FastAPI) serves the API + MCP and the built frontend at "/".
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS production

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code (Python packages)
COPY backend/ ./backend/
COPY gateway/ ./gateway/

# Built frontend → served as static files at "/" by the gateway
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Cloud Run injects PORT at runtime; default fallback for local runs.
ENV PORT=8080
EXPOSE 8080

# Production server: no --reload. The gateway reads PORT for both the HTTP bind
# and its in-process MCP client (http://localhost:$PORT/mcp).
CMD ["sh", "-c", "uvicorn gateway.app:app --host 0.0.0.0 --port ${PORT:-8080}"]
