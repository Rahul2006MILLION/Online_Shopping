# BASKET — Environment and Secrets Configuration Guide

This guide details all environment variables, security configurations, and credential practices across backend, frontend, and cloud infrastructure.

---

## 1. Security & Secrets Management Principles

- **Zero Secrets in Source Control:** Never commit `.env`, `.env.local`, `.pem`, `.cert`, `.key`, or API tokens.
- **Git Ignore Safeguards:** `.gitignore` explicitly excludes `.env`, `*.env`, `.env.*`, and `infra/aiven/certs/`.
- **Placeholder Templates Only:** Only commit `.env.example` templates with generic placeholders.
- **Production Guardrail:** The backend automatically aborts at startup if `ENVIRONMENT=production` and `SECRET_KEY` remains the insecure development default.

---

## 2. Backend Environment Variables (`backend/.env`)

The backend configuration is managed by Pydantic Settings in `backend/app/core/config.py`.

| Variable | Type | Default | Description |
|---|---|---|---|
| `ENVIRONMENT` | string | `development` | Runtime environment: `development`, `testing`, or `production`. |
| `DEBUG` | boolean | `false` | Enables debug logging and verbose tracebacks when `true`. |
| `PROJECT_NAME` | string | `BASKET Backend` | Display title for API documentation and health probes. |
| `API_V1_STR` | string | `/api/v1` | Prefix for versioned REST API routes. |
| `HOST` | string | `0.0.0.0` | Bind address for Uvicorn ASGI server. |
| `PORT` | integer | `8000` | Port for Uvicorn ASGI server. |
| `LOG_LEVEL` | string | `INFO` | Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`). |
| `SECRET_KEY` | SecretStr | `insecure-default...` | Cryptographic secret for signing session tokens and quotes. Must be >= 32 chars in production. |
| `ALLOWED_HOSTS` | list[str] | `["*"]` | Allowed HTTP Host headers. |
| `CORS_ORIGINS` | list[str] | `["http://localhost:3000"]` | Allowed client origins (comma-separated or JSON list). |
| `DATABASE_URL` | string | `None` | SQLAlchemy async connection string (e.g. `postgresql+asyncpg://...`). |
| `DATABASE_POOL_SIZE`| integer | `10` | SQLAlchemy connection pool size (ignored for SQLite). |
| `DATABASE_MAX_OVERFLOW`| integer | `5` | Maximum overflow connections beyond pool size. |
| `DATABASE_SSL_MODE` | string | `require` | SSL mode for PostgreSQL (`require`, `prefer`, `disable`). |
| `KAFKA_BOOTSTRAP_SERVERS` | string | `None` | Aiven Kafka broker address (`host:port`). |
| `KAFKA_SECURITY_PROTOCOL` | string | `SSL` | Kafka protocol (`SSL`, `PLAINTEXT`). |
| `KAFKA_SSL_CA_LOCATION` | string | `None` | File path to Kafka CA certificate (`ca.pem`). |
| `KAFKA_SSL_CERTIFICATE_LOCATION` | string | `None` | File path to client access certificate (`service.cert`). |
| `KAFKA_SSL_KEY_LOCATION` | string | `None` | File path to client access key (`service.key`). |
| `OPENSEARCH_URL` | string | `None` | Aiven OpenSearch URL (`https://host:port`). |
| `OPENSEARCH_USERNAME` | string | `None` | OpenSearch authentication username. |
| `OPENSEARCH_PASSWORD` | SecretStr | `None` | OpenSearch authentication password. |
| `OPENSEARCH_INDEX_PREFIX` | string | `basket` | Prefix for OpenSearch index aliases. |
| `QUOTE_SIGNING_SECRET` | SecretStr | (Required in P1) | HMAC secret for signing 5-minute checkout quote tokens. |
| `DEMO_MODE` | boolean | `true` | Allows `/api/v1/orders/{id}/demo-confirm` in development. Automatically disabled in production. |

---

## 3. Frontend Environment Variables (`frontend/.env.local`)

| Variable | Type | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | string | `http://localhost:8000` | Backend API base URL accessible by the browser client. |

---

## 4. Operating Modes

### Mode 1: Local Development (Unconfigured Cloud)
- Set `DATABASE_URL=""` (empty).
- The backend starts normally with degraded readiness.
- Health:
  - `GET /health` -> `HTTP 200 {"status": "ok"}`
  - `GET /ready` -> `HTTP 200 {"status": "degraded", "checks": {"database": {"status": "unconfigured"}}}`
- Allows frontend development and backend route prototyping without active cloud credentials.

### Mode 2: Automated Testing (SQLite In-Memory)
- Activated during `pytest`.
- Uses `sqlite+aiosqlite:///:memory:`.
- Database engine detects SQLite driver and automatically disables PostgreSQL connection pool settings (`pool_size`, `max_overflow`), using `StaticPool` to prevent pool argument errors.

### Mode 3: Live Cloud Integration (Aiven Cloud Services)
- Requires active Aiven credentials.
- Set `DATABASE_URL=postgresql+asyncpg://avnadmin:<PASSWORD>@<HOST>:<PORT>/defaultdb?ssl=require`.
- Place Kafka certificates in `infra/aiven/certs/` (ignored by Git):
  - `infra/aiven/certs/ca.pem`
  - `infra/aiven/certs/service.cert`
  - `infra/aiven/certs/service.key`
- Set `KAFKA_BOOTSTRAP_SERVERS` and `OPENSEARCH_URL`.

---

## 5. How to Obtain Aiven Credentials

1. **Log in to Aiven Console:** [https://console.aiven.io](https://console.aiven.io)
2. **PostgreSQL Service:**
   - Navigate to your PostgreSQL service overview.
   - Copy the **Service URI**.
   - Convert scheme from `postgres://` to `postgresql+asyncpg://` for the async backend driver.
   - Append `?ssl=require`.
3. **Kafka Service:**
   - Navigate to your Kafka service overview.
   - Note the **Service URI** (`host:port`).
   - In the **Authentication** tab, download:
     - CA Certificate (`ca.pem`)
     - Access Certificate (`service.cert`)
     - Access Key (`service.key`)
   - Save these three files into `infra/aiven/certs/`.
4. **OpenSearch Service:**
   - Navigate to your OpenSearch service overview.
   - Copy **Service URI**, User (`avnadmin`), and Password.

---

## 6. Secret Rotation Procedure

1. **Database Password Rotation:**
   - Reset password in Aiven Console.
   - Update `DATABASE_URL` in `backend/.env`.
   - Restart FastAPI application.
2. **Quote Signing Key Rotation:**
   - When rotating `QUOTE_SIGNING_SECRET`, support dual-key verification by setting `QUOTE_SIGNING_KEYS="<new_key>,<old_key>"` in environment settings.
   - New quotes will be signed with the first key; quotes in flight within their 5-minute TTL will continue to verify with the fallback key.
