# BASKET — New Developer Quick-Start Guide

Welcome to BASKET. Follow this step-by-step guide to get your local environment running and verified in under 10 minutes.

---

## Prerequisites

Before starting, ensure your host system has the following tools installed:

| Tool | Required Version | Verification Command |
|---|---|---|
| **Git** | >= 2.40 | `git --version` |
| **Node.js** | >= 20.x (22 LTS recommended) | `node -v` |
| **npm** | >= 10.x | `npm -v` |
| **Python** | 3.12.x | `python3 --version` |
| **uv** | >= 0.5.0 | `uv --version` |

If you do not have `uv` installed, install it via:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

---

## Step 1: Clone Repository & Select Branch

```bash
git clone https://github.com/Rahul2006MILLION/Online_Shopping basket
cd basket

# Checkout integration branch
git checkout integration
git pull origin integration
```

---

## Step 2: Automated Bootstrap (Recommended)

You can bootstrap both backend and frontend dependencies with a single command:
```bash
./scripts/dev-setup.sh
```

---

## Step 3: Manual Step-by-Step Setup (Alternative)

If you prefer to configure each subsystem manually:

### 3.1 Backend Setup
```bash
cd backend

# Create virtual environment using Python 3.12
uv venv --python 3.12 .venv

# Activate virtual environment
source .venv/bin/activate

# Install backend package and developer dependencies in editable mode
uv pip install -e ".[dev]"

# Create environment configuration from template
cp .env.example .env

cd ..
```

### 3.2 Frontend Setup
```bash
cd frontend

# Install Node dependencies
npm install

# Create environment configuration from template
cp .env.example .env.local

cd ..
```

---

## Step 4: Environment Variables & External Service Modes

The platform supports two operating modes:

### Mode A: Local Development (Without Live Cloud Credentials)
- By default, `backend/.env` has `DATABASE_URL` commented out or empty.
- In this mode:
  - Backend runs in degraded development mode.
  - `/health` returns `HTTP 200 OK`.
  - `/ready` returns `HTTP 200 OK` with status `"degraded"` and check `{"database": {"status": "unconfigured"}}`.
  - In-memory SQLite engine is used during automated test runs.
  - You can develop frontend layouts and core routing without an active Aiven account.

### Mode B: Live Cloud Integration (With Aiven Services)
- To connect to live cloud services, fill in the credentials in `backend/.env` and `infra/.env.example`:
  ```ini
  DATABASE_URL=postgresql+asyncpg://avnadmin:<PASSWORD>@<HOST>:<PORT>/defaultdb?ssl=require
  KAFKA_BOOTSTRAP_SERVERS=<HOST>:<PORT>
  OPENSEARCH_URL=https://<HOST>:<PORT>
  ```
- See [docs/ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md) for full secret configuration instructions.

---

## Step 5: Start Development Servers

Open two terminal windows:

### Terminal 1: Backend API Server
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```
- API Base URL: `http://localhost:8000`
- Swagger Interactive Docs: `http://localhost:8000/docs`
- Health Probe: `http://localhost:8000/health`
- Readiness Probe: `http://localhost:8000/ready`
- API Info: `http://localhost:8000/api/v1/info`

### Terminal 2: Frontend Web Server
```bash
cd frontend
npm run dev
```
- Web Application: `http://localhost:3000`
- The homepage includes a live **System Status** dashboard that polls the backend health and readiness endpoints.

---

## Step 6: Execute Test Suites

Verify both test suites run cleanly:

### 6.1 Backend Tests
```bash
cd backend
source .venv/bin/activate
pytest -v
```
*Expected: 12 passed in < 0.2s.*

### 6.2 Frontend Tests
```bash
cd frontend
npm test
```
*Expected: 7 passed in < 0.1s.*

---

## Step 7: Linting & Type Checking

### Backend Checks
```bash
cd backend
source .venv/bin/activate
ruff check .
ruff format --check .
```

### Frontend Checks
```bash
cd frontend
npm run type-check
npm run lint
```

---

## Step 8: Full Quality Gate Verification

Before creating any branch or committing code, run the repository verification gate:
```bash
./scripts/verify-environment.sh
```
When all checks pass, you will see:
```text
==========================================
✓ ALL VERIFICATION GATES PASSED CLEANLY
==========================================
```

---

## Next Steps

Now that your foundation is verified:
1. Read [DEVELOPER_HANDOFF.md](../DEVELOPER_HANDOFF.md) for architecture rules and your first assigned task.
2. Read [PROJECT_STATUS.md](../PROJECT_STATUS.md) to understand current progress and open decisions.
3. Read [CONTRIBUTING.md](../CONTRIBUTING.md) for branch naming and commit rules.
