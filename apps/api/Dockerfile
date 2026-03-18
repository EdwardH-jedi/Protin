# ─── Stage 1: dependency installer ──────────────────────────────────────────
#
# Uses the official uv image so we get a reproducible, fast install.
# Run `uv lock` locally before building if uv.lock is missing or stale.
#
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

WORKDIR /app

# Copy dependency manifest and lock file first so Docker can cache this layer.
COPY pyproject.toml uv.lock ./

# Install production dependencies into an isolated .venv.
# --frozen   : refuse to update uv.lock (fails fast if stale)
# --no-dev   : exclude test/lint dependencies
RUN uv sync --frozen --no-dev


# ─── Stage 2: runtime image ──────────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Bring over only the installed virtual environment from the builder.
COPY --from=builder /app/.venv /app/.venv

# Copy application source.
COPY . .

# Activate the venv for all subsequent RUN / CMD invocations.
ENV PATH="/app/.venv/bin:$PATH"

# Prevent Python from buffering stdout/stderr so logs appear immediately.
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

# Default command — override in docker-compose for the worker process.
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--log-level", "info", \
     "--access-log"]
