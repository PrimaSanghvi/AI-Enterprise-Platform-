# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

# Baked in at build time — pass via --build-arg or Cloud Build substitution
# GCP Secret: VITE_GOOGLE_CLIENT_ID
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}

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

# Backend source
COPY backend/ ./
COPY gateway/ ./gateway/

# Built frontend — served as static files by FastAPI at "/"
COPY --from=frontend-builder /app/frontend/dist ./public

# ── Hardcoded production config (never put in GCP Secrets) ───────────────────
# Seeds data on first startup; skips if rows already exist (idempotent)
ENV AUTO_SEED=true

EXPOSE 8080

# GCP Secrets injected at runtime by Cloud Run:
#   DATABASE_URL, DB_SCHEMA, GOOGLE_CLIENT_ID, JWT_SECRET,
#   ANTHROPIC_API_KEY, ANTHROPIC_MODEL_ID
#
# Cloud Run injects PORT; we default to 8080
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
