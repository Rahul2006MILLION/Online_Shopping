# Multi-stage Dockerfile for BASKET Backend (FastAPI)
FROM python:3.12-slim AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency resolution
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

COPY pyproject.toml .
RUN uv venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN uv pip install -e .

# Runner stage
FROM python:3.12-slim AS runner

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged application user
RUN groupadd -g 1001 basket && \
    useradd -u 1001 -g basket -s /bin/bash -m basket

COPY --from=builder /opt/venv /opt/venv
COPY . /app

RUN chown -R basket:basket /app

USER basket

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f "http://localhost:${PORT:-8000}/health" || exit 1

# Migrates, optionally seeds demo data, then serves on $PORT (Render) or 8000.
CMD ["./docker-entrypoint.sh"]
