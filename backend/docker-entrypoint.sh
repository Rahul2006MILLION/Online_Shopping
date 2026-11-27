#!/bin/sh
# BASKET backend container entrypoint.
# 1. Apply database migrations (idempotent).
# 2. Optionally load the labelled demonstration data (idempotent; the seeder
#    refuses to run when ENVIRONMENT=production).
# 3. Start the API on the port the platform provides ($PORT on Render), else 8000.
set -e

if [ "${RUN_MIGRATIONS_ON_START:-true}" = "true" ]; then
  echo "[entrypoint] Applying database migrations..."
  alembic upgrade head
fi

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  echo "[entrypoint] Seeding demonstration marketplace data..."
  python -m app.seeds.seed_demo_marketplace
fi

exec uvicorn app.main:create_app --factory \
  --host 0.0.0.0 --port "${PORT:-8000}" \
  --proxy-headers --forwarded-allow-ips="*"
