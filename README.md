# BASKET — Project Control Centre & Monorepo

> **BASKET** is a modern, high-reliability multi-category online shopping platform architected for a retail chain expanding across India. It supports fresh groceries, personal care, household essentials, and packaged consumer goods with server-authoritative commerce and real-time event-driven infrastructure.

---

## 1. Quick Navigation & Documentation Index

| Document | Purpose |
|---|---|
| **[DEVELOPER_HANDOFF.md](DEVELOPER_HANDOFF.md)** | **Primary onboarding guide for incoming developers taking over the project.** |
| **[PROJECT_STATUS.md](PROJECT_STATUS.md)** | Factual component implementation status, test evidence, and open decisions. |
| **[docs/NEW_DEVELOPER_QUICKSTART.md](docs/NEW_DEVELOPER_QUICKSTART.md)** | Step-by-step local setup, dependency install, and execution instructions. |
| **[docs/ENVIRONMENT_SETUP.md](docs/ENVIRONMENT_SETUP.md)** | Secrets management, environment variables, SSL certificates, and Aiven cloud config. |
| **[docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md)** | Phased milestones (Phase 0 through Phase E) and core vs differentiator roadmaps. |
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | Git workflow, branch naming, commit format, PR review, and migration rules. |
| **[CHANGELOG.md](CHANGELOG.md)** | Verified chronological history of features, bug fixes, and documentation updates. |
| **[PROJECT_CHARTER.md](PROJECT_CHARTER.md)** | Business vision, mandatory customer journey, and non-negotiables. |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | System boundaries, Transactional Outbox pattern, and data authority invariants. |
| **[API_CONTRACTS.md](API_CONTRACTS.md)** | Implemented vs planned REST interfaces, schemas, and error envelopes. |
| **[DATA_MODEL.md](DATA_MODEL.md)** | Relational data model, inventory lifecycle, and migration discipline. |
| **[TASK_BREAKDOWN.md](TASK_BREAKDOWN.md)** | Team roles, Phase 1 task ownership, and parallel work split. |
| **[QUALITY_GATES.md](QUALITY_GATES.md)** | Definition of Done, automated checks, and release criteria. |
| **[DECISIONS.md](DECISIONS.md)** | Architecture Decision Records (ADRs) accepted and pending. |
| **[AGENT_HANDOFF.md](AGENT_HANDOFF.md)** | Append-only inter-developer and agent communication log. |

---

## 2. Current Implementation Status

- **Phase 0 (Foundation Baseline):** **`COMPLETED & VERIFIED`**
  - FastAPI modular monolith with lifespan context, structured logging, request ID middleware, and global error handling.
  - Health (`/health`) and readiness (`/ready`) endpoints verifying database connectivity and graceful development degradation.
  - SQLAlchemy 2.0 async engine supporting Aiven PostgreSQL with SSL and SQLite in-memory testing.
  - Next.js 15 App Router frontend with React 19, Tailwind CSS, shadcn/ui primitives, and live System Status widget.
  - Centralized typed API client (`ApiClient`) with GET, POST, PATCH, DELETE and unit tests.
  - Automated bootstrap (`scripts/dev-setup.sh`) and verification (`scripts/verify-environment.sh`) scripts.
  - Merged into `integration` via PR #1 (`db9d790`).
- **Phase 1 (Core Commerce Implementation):** **`PLANNED / READY FOR CONTRACT FREEZE`**
  - Architecture proposals reviewed; 10 outstanding schema and concurrency decisions documented in [PROJECT_STATUS.md](PROJECT_STATUS.md).
  - Ready for Phase 1 database migration (`0002_phase1_commerce_schema.py`) and module feature implementation.

---

## 3. Technology Stack

### Frontend
- **Framework:** Next.js 15 (App Router, Server & Client Components)
- **UI & Styling:** React 19, Tailwind CSS, shadcn/ui primitives (`Button`, `Card`, `Badge`)
- **Language:** TypeScript 5.x (Strict Mode)
- **State & Networking:** Centralized typed `ApiClient` with structured `ApiClientError`

### Backend
- **Framework:** FastAPI >= 0.115.0 (Modular Monolith)
- **Language & Runtime:** Python 3.12 managed via `uv`
- **ORM & Migrations:** SQLAlchemy 2.0 (async) + Alembic 1.13+
- **Validation & Settings:** Pydantic v2 + Pydantic Settings
- **Testing & Quality:** pytest, pytest-asyncio, Ruff (linting & formatting)

### Infrastructure & Cloud Services
- **System of Record:** Aiven PostgreSQL 16 (authoritative for price, stock, reservations, orders)
- **Event Bus:** Aiven Apache Kafka 3.x (order domain events via Transactional Outbox)
- **Search Engine:** Aiven OpenSearch 2.x (derived product search index)
- **Payments:** Razorpay Sandbox (future planned integration; server-side verification only)

---

## 4. Architecture Overview

```text
                  Customer / Retailer / Admin
                               |
                               v
                  Next.js 15 + TypeScript Frontend
                               |
                           HTTPS / JSON
                               |
                               v
                     FastAPI Modular Monolith
             (app/api/v1, app/core, app/modules, app/events)
                       |               |
   Transactional Outbox│               │Authoritative Commerce
                       v               v
             ┌─────────────────┐     ┌────────────────────────────────────┐
             │  outbox_events  │     │ Aiven PostgreSQL (System of Record)│
             └────────┬────────┘     │ - Users & Guest Sessions           │
                      │              │ - Products, Variants, Listings     │
         Lease-Fenced │              │ - Prices (paise) & Inventory       │
            Publisher │              │ - Carts, Orders, Reservations      │
                      v              └────────────────────────────────────┘
             ┌─────────────────┐
             │   Aiven Kafka   │
             │   (Event Bus)   │
             └────────┬────────┘
                      │
                      │ Asynchronous Consumer
                      v
             ┌─────────────────┐
             │ Aiven OpenSearch│ <--- (Frontend Product Search / Facets)
             │(Derived Search) │
             └─────────────────┘
```

### Core Architecture Invariants
1. **PostgreSQL is the Sole Authority:** All pricing, stock calculations, reservations, and orders are validated strictly in PostgreSQL under transactional row locks.
2. **OpenSearch is Read-Only:** OpenSearch is an eventually consistent search projection. It never authorizes checkout or determines stock availability.
3. **Transactional Outbox:** Dual-writes between database and message broker are forbidden. Events are committed to `outbox_events` in the same transaction as business data.
4. **All-or-Nothing Reservations:** Multi-item carts are reserved atomically. Sorted row-locking (`ORDER BY listing_id ASC FOR UPDATE`) prevents deadlocks.
5. **AI is Advisory:** AI features provide explanations and recommendations; backend code enforces all authorization, prices, and state transitions.

---

## 5. Monorepo Repository Structure

```text
basket/
├── frontend/                     # Next.js 15 frontend application
│   ├── app/                      # App router pages, layouts, globals
│   ├── components/               # UI components (shadcn/ui & shared)
│   ├── features/                 # Domain feature components (catalogue, cart, etc.)
│   ├── lib/                      # Centralized API client and utilities
│   ├── types/                    # Shared TypeScript interfaces
│   ├── package.json
│   └── .env.example
├── backend/                      # FastAPI modular monolith application
│   ├── app/
│   │   ├── api/                  # Versioned API routes (/api/v1) & dependencies
│   │   ├── core/                 # Config, database engine, logging, exceptions
│   │   ├── modules/              # Domain modules (catalogue, cart, orders, etc.)
│   │   └── main.py               # Application factory & lifespan
│   ├── alembic/                  # Database migration versions and harness
│   ├── tests/                    # Pytest test suite (12 tests)
│   ├── pyproject.toml
│   └── requirements.txt
├── docs/                         # Onboarding, environment, and roadmap guides
│   ├── NEW_DEVELOPER_QUICKSTART.md
│   ├── ENVIRONMENT_SETUP.md
│   └── IMPLEMENTATION_ROADMAP.md
├── infra/                        # Infrastructure templates and cloud configurations
│   ├── aiven/
│   └── .env.example
├── scripts/                      # Bootstrap and verification quality gates
│   ├── dev-setup.sh              # One-command developer bootstrap
│   └── verify-environment.sh     # Comprehensive foundation verification
├── README.md                     # Project control centre (this file)
├── PROJECT_STATUS.md             # Factual implementation status and test evidence
├── DEVELOPER_HANDOFF.md          # Primary onboarding guide for new developers
├── CONTRIBUTING.md               # Git workflow, branch naming, and PR checklist
├── CHANGELOG.md                  # Chronological change log
├── PROJECT_CHARTER.md            # Vision, scope, and non-negotiables
├── ARCHITECTURE.md               # System boundaries and data authority
├── AGENT_RULES.md                # Mandatory agent guardrails and conventions
├── AGENT_HANDOFF.md              # Shared communication and sync log
├── API_CONTRACTS.md              # Implemented and proposed REST interfaces
├── DATA_MODEL.md                 # Entity relationships and migration rules
├── DEVELOPMENT_WORKFLOW.md       # Git branches, PRs, and worktree routines
├── TASK_BREAKDOWN.md             # Role assignments and phase tracking
├── QUALITY_GATES.md              # Definition of Done and gate criteria
└── DECISIONS.md                  # Architecture Decision Records (ADRs)
```

---

## 6. Local Setup & Execution

### One-Command Automated Bootstrap
```bash
./scripts/dev-setup.sh
```

### Manual Setup

#### 1. Backend Setup
```bash
cd backend
uv venv --python 3.12 .venv
source .venv/bin/activate
uv pip install -e ".[dev]"
cp .env.example .env
```

#### 2. Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env.local
```

### Running Development Servers

#### Start Backend API
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```
- API Base: `http://localhost:8000`
- Interactive API Docs: `http://localhost:8000/docs`
- Health Probe: `http://localhost:8000/health`
- Readiness Probe: `http://localhost:8000/ready`

#### Start Frontend UI
```bash
cd frontend
npm run dev
```
- Storefront: `http://localhost:3000`

---

## 7. Testing & Quality Assurance

### Run Individual Checks
- **Backend Tests:** `cd backend && pytest -v` (12 tests pass)
- **Backend Linting:** `cd backend && ruff check . && ruff format --check .`
- **Frontend Tests:** `cd frontend && npm test` (7 tests pass)
- **Frontend Type Check:** `cd frontend && npm run type-check`
- **Frontend Build:** `cd frontend && npm run build`

### Full Quality Gate (Run Before Committing)
Run the automated verification script from repository root:
```bash
./scripts/verify-environment.sh
```

---

## 8. Next Milestone

The immediate next task is **Phase 1 Contract Freeze & Core Database Migration**:
1. Resolve the 10 outstanding decisions detailed in [PROJECT_STATUS.md](PROJECT_STATUS.md).
2. Author Alembic migration `0002_phase1_commerce_schema.py`.
3. Begin parallel implementation across Developer 1 (Discovery & Search) and Developer 2 (Cart, Inventory & Orders).
