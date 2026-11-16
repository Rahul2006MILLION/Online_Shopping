# BASKET — Master Developer Handoff Guide

> **Target Audience:** Incoming Software Engineer(s) / Technical Lead taking over the BASKET project.  
> **Author:** Technical Lead & Foundation Release Coordinator  
> **Date:** 2026-11-16  
> **Repository:** [https://github.com/Rahul2006MILLION/Online_Shopping](https://github.com/Rahul2006MILLION/Online_Shopping)  
> **Base Branch:** `integration`  
> **Handoff Branch:** `docs/developer-handoff`  

---

## 1. Project Overview & Background

### What is BASKET?
BASKET is a multi-category online shopping platform designed for a retail chain expanding across India. It supports fresh groceries, personal care, electronics, and household goods through a unified storefront.

### Problem It Solves
Traditional e-commerce platforms often decouple search and checkout from physical inventory realities, leading to inventory overselling, out-of-sync search results, and brittle microservice architectures. BASKET addresses this with:
- A **modular monolith** that keeps operational complexity minimal for a small engineering team.
- **Server-authoritative commerce:** PostgreSQL is the single source of truth for pricing, stock, reservations, and orders.
- **Asynchronous search projections:** OpenSearch provides high-performance faceted discovery without ever granting financial or inventory authority.
- **Transactional outbox:** Kafka events are published reliably without dual-write race conditions.
- **All-or-nothing atomic inventory reservations:** Stock is locked at checkout to eliminate overselling during high-demand flash sales ("Sale Storm").

---

## 2. Current Repository State

```
Current Git Branch:        docs/developer-handoff
Parent Tracking Branch:    origin/integration
Latest Foundation Commit:  db9d790 (Merge pull request #1 from feature/phase0-foundation)
Foundation Test Status:    12/12 Backend tests passing, 7/7 Frontend tests passing
Build Status:              Clean Next.js 15 production build; Ruff format & lint passing
```

### What Has Actually Been Implemented (Phase 0)
1. **FastAPI Modular Monolith Shell (`backend/app/main.py`):**
   - Application factory with lifespan context manager.
   - Structured JSON logging (`backend/app/core/logging.py`).
   - Global exception handlers returning standardized error envelopes (`error.code`, `error.message`, `error.request_id`, `error.details`).
   - Request ID tracing middleware (`X-Request-ID`).
   - CORS middleware configured via Pydantic Settings.
   - Health probes:
     - `GET /health`: Liveness probe indicating process health.
     - `GET /ready`: Readiness probe checking database connectivity (returns HTTP 200 when connected, HTTP 200 with degraded status in unconfigured development, HTTP 503 in production or on connection failure).
     - `GET /api/v1/info`: API version and environment metadata.
2. **Database Engine & Migration Infrastructure (`backend/app/core/database.py`, `backend/alembic/`):**
   - Async SQLAlchemy 2.0 engine with connection pooling (`asyncpg`).
   - SSL support for Aiven PostgreSQL (`sslmode=require`).
   - SQLite in-memory engine fallback for lightweight testing without unsupported pool arguments.
   - Alembic migration environment configured and verified (`0001_initial_baseline.py`).
3. **Next.js 15 Frontend Shell (`frontend/`):**
   - Next.js 15 App Router with React 19, TypeScript strict mode, and Tailwind CSS.
   - Reusable UI primitives in `frontend/components/ui/` (`Button`, `Card`, `Badge`).
   - Layout with Header, Footer, and live `SystemStatus` dashboard widget (`frontend/components/shared/system-status.tsx`) verifying `/health` and `/ready`.
4. **Centralized Typed API Client (`frontend/lib/api/client.ts`):**
   - Fetch wrapper supporting GET, POST, PATCH, DELETE.
   - Structured error unwrapping into `ApiClientError`.
   - Comprehensive test suite in `frontend/lib/api/client.test.ts`.
5. **Developer Tooling & Verification Scripts (`scripts/`):**
   - `scripts/dev-setup.sh`: Automated local environment bootstrap.
   - `scripts/verify-environment.sh`: Automated CI/CD quality gate verifying Git, Python, Ruff, Pytest, Alembic, Node, TypeScript, and Next.js build.

### What Has NOT Been Implemented (Phase 1 Scope)
- **Domain Modules:** `backend/app/modules/` and `frontend/features/` are currently empty directories.
- **Commerce Database Schema:** No commerce tables (`products`, `prices`, `store_inventory`, `carts`, `orders`, `inventory_reservations`, `outbox_events`) have been migrated yet.
- **Kafka & Outbox:** No outbox publisher daemon or Kafka consumer worker exists.
- **OpenSearch:** No OpenSearch indexing sync or search endpoints exist.
- **Live Cloud Connectivity:** The codebase has not been run against live Aiven cloud credentials.

---

## 3. Technology Stack & Runtime Matrix

| Subsystem | Technology | Version | Location / Config |
|---|---|---|---|
| **Runtime (Backend)** | Python | 3.12.x | `backend/pyproject.toml` |
| **Package Manager (Backend)** | uv | >= 0.5.0 | `backend/` |
| **Framework (Backend)** | FastAPI | >= 0.115.0 | `backend/app/main.py` |
| **ORM / DB Driver** | SQLAlchemy (async) + asyncpg | >= 2.0.30 | `backend/app/core/database.py` |
| **Migrations** | Alembic | >= 1.13.0 | `backend/alembic/` |
| **Runtime (Frontend)** | Node.js | >= 20.x (22 LTS tested) | `frontend/package.json` |
| **Package Manager (Frontend)** | npm | >= 10.x | `frontend/package-lock.json` |
| **Framework (Frontend)** | Next.js (App Router) | 15.5.x | `frontend/next.config.ts` |
| **UI Library** | React | 19.x | `frontend/package.json` |
| **Styling** | Tailwind CSS | 3.4.x | `frontend/tailwind.config.ts` |
| **Database** | Aiven PostgreSQL | 16.x | Configured in `infra/.env.example` |
| **Event Bus** | Aiven Apache Kafka | 3.x | Configured in `infra/.env.example` |
| **Search Engine** | Aiven OpenSearch | 2.x | Configured in `infra/.env.example` |

---

## 4. Architectural Principles & Invariants

Incoming developers **must adhere** to the following architecture invariants:

1. **PostgreSQL is the Sole Authority:**
   - Client-provided prices, subtotals, discounts, and inventory counts are **untrusted**.
   - The backend re-validates all prices and stock against PostgreSQL during checkout under exclusive row locks (`SELECT ... FOR UPDATE`).
2. **OpenSearch is a Read-Only Projection:**
   - OpenSearch is used exclusively for product discovery, autocomplete, and faceted filtering.
   - It is eventually consistent with PostgreSQL.
   - Checkout code must **never** query OpenSearch to verify pricing or inventory.
3. **No Distributed Transactions (Dual-Writes):**
   - The application uses the **Transactional Outbox** pattern.
   - Business mutations (e.g. order creation, inventory reservation) write domain events to the `outbox_events` table in the *same* PostgreSQL transaction.
   - A separate background daemon reads unpublished outbox rows and publishes them to Kafka with lease fencing.
4. **Atomic Multi-Item Inventory Reservations:**
   - Checkout reservations are all-or-nothing across all cart items.
   - Item locks must be acquired in **sorted order** (`ORDER BY listing_id ASC FOR UPDATE`) to prevent deadlocks.
   - Database check constraint `CHECK (on_hand_quantity >= reserved_quantity AND reserved_quantity >= 0)` guarantees no overselling.
5. **AI is Advisory Only:**
   - LLM tools and AI assistants may suggest products, translate queries, or summarize reviews.
   - AI code must **never** have direct SQL access, execute arbitrary mutations, or override financial or inventory logic.

---

## 5. Local Setup & Verification Guide

### Quick Start (One Command)
From the repository root:
```bash
./scripts/dev-setup.sh
```

### Step-by-Step Manual Setup

#### 1. Backend Setup
```bash
cd backend

# Create virtual environment with Python 3.12 via uv
uv venv --python 3.12 .venv
source .venv/bin/activate

# Install dependencies in editable mode with dev tools
uv pip install -e ".[dev]"

# Configure environment variables
cp .env.example .env
```

#### 2. Frontend Setup
```bash
cd frontend

# Install npm packages
npm install

# Configure environment variables
cp .env.example .env.local
```

#### 3. Running Development Servers
- **Backend Server:**
  ```bash
  cd backend
  source .venv/bin/activate
  uvicorn app.main:app --reload --port 8000
  ```
  Swagger Docs: `http://localhost:8000/docs`  
  Health Check: `http://localhost:8000/health`  
  Readiness Check: `http://localhost:8000/ready`  

- **Frontend Server:**
  ```bash
  cd frontend
  npm run dev
  ```
  App UI: `http://localhost:3000`

#### 4. Running the Complete Quality Gate
Before submitting any pull request or committing changes, run:
```bash
./scripts/verify-environment.sh
```
This runs:
- Git branch and remote sanity checks
- Python syntax, Ruff linting, and formatting checks
- Pytest backend test suite (12 tests)
- Alembic migration discovery check
- Node.js version check
- TypeScript strict compiler check (`tsc --noEmit`)
- Next.js production build (`next build`)

---

## 6. Git Workflow & Collaboration Rules

### Branching Strategy
- **`main`:** Production/demo-ready baseline. Never push directly to `main`.
- **`integration`:** Shared development trunk. All feature branches branch from and merge into `integration` via pull requests.
- **`feature/<feature-name>`:** Individual developer work branches.
- **`docs/<doc-name>`:** Documentation updates.

### Developer Ownership Split (Phase 1 Recommendation)
- **Developer 1 (Discovery & Search):**
  - Backend: `backend/app/modules/catalogue/`, `backend/app/modules/search/`
  - Frontend: `frontend/features/catalogue/`, `frontend/features/search/`
  - Workers: OpenSearch indexing consumer
- **Developer 2 (Cart, Inventory & Orders):**
  - Backend: `backend/app/modules/cart/`, `backend/app/modules/inventory/`, `backend/app/modules/orders/`, `backend/app/modules/checkout/`
  - Frontend: `frontend/features/cart/`, `frontend/features/checkout/`
  - Workers: Transactional outbox publisher daemon
- **Integration Owner:**
  - Shared Alembic migrations (`backend/alembic/versions/`)
  - Shared API schemas (`backend/app/core/`, `frontend/types/`)
  - Shared PR reviews and merge coordination into `integration`

---

## 7. Recommended First Tasks for the Incoming Developer

To make immediate, safe progress, execute these tasks in order:

### Task 1: Environment Verification
Clone the repo and run `./scripts/verify-environment.sh` to confirm your local machine satisfies all prerequisites.

### Task 2: Review and Resolve the 10 Outstanding Decisions
Read [Section 8 of this document](#8-the-10-open-decisions-requiring-coordination) and [PROJECT_STATUS.md](PROJECT_STATUS.md). Agree with your team lead or co-developer on:
1. The exact reservation schema (`inventory_reservations` single-table vs parent/child).
2. The canonical naming of `store_listings`.
3. The guest checkout session lifecycle.

### Task 3: Author the Core Alembic Migration
Author the Phase 1 migration `0002_phase1_commerce_schema.py` under the coordination of the Integration Owner. Apply it locally to SQLite or Aiven PostgreSQL to create the initial tables.

### Task 4: Implement the Minimal Vertical Slice
1. Seed 5 products with listings, inventory, and prices.
2. Implement `GET /api/v1/products` and `GET /api/v1/products/{id}`.
3. Wire the frontend catalogue page to render these products.
4. Implement cart add/remove and verify end-to-end.

---

## 8. The 10 Open Decisions Requiring Coordination

**DO NOT CHANGE OR IMPLEMENT THESE WITHOUT FORMAL SIGN-OFF:**

1. **Reservation Model:** Choose between a flat `inventory_reservations` table (1 row per item reservation) vs parent `inventory_reservations` + `reservation_items`. Recommendation: Flat table with `(order_id, listing_id, quantity)` for simpler row locking.
2. **Order & Reservation Circular FK:** Ensure `orders` is inserted first with `status = 'PENDING_PAYMENT'`, followed by child reservation rows referencing `orders.id`.
3. **OpenSearch Versioning:** Standardize on millisecond event timestamps (`occurred_at_ms`) as external version numbers for `version_type=external_gte`.
4. **Concurrent Idempotency Handling:** Catch database unique constraint collisions on `idempotency_records` during checkout and return `409 Conflict (REQUEST_IN_PROGRESS)`.
5. **Quote Binding:** Decide whether `POST /checkout/quote` signs an immutable item snapshot or explicitly references `cart_id` and `cart_version`.
6. **Guest Session Retention:** Define a TTL policy (e.g. 30 days) and account linking workflow for guest orders.
7. **Reservation Expiry Worker:** Ensure the expiry daemon atomically transitions expired reservations, replenishes `store_inventory.reserved_quantity`, sets `orders.status = 'CANCELLED'`, and emits `order.cancelled`.
8. **Outbox Schema Columns:** Include explicit `topic VARCHAR(100)` and `partition_key VARCHAR(255)` columns in `outbox_events`.
9. **DLQ Policy:** Specify dead-letter routing to `basket.<domain>.dlq`, consumer offset committing, and the reindex reconciliation CLI.
10. **Listing Entity Naming:** Enforce `store_listings` consistently and eliminate references to `retailer_listings`.

---

## 9. What You Must NOT Change Without Coordination

- **Do NOT** rewrite or bypass `/health` and `/ready` probes in `backend/app/main.py`.
- **Do NOT** remove SQLite engine support in `backend/app/core/database.py` (it is required for fast local unit testing).
- **Do NOT** add Redis, MongoDB, or extra databases. PostgreSQL, Kafka, and OpenSearch are the fixed stack.
- **Do NOT** commit `.env` files or hardcode credentials into the repository.
- **Do NOT** fabricate payment success or simulate payment gateway webhooks in production mode.
- **Do NOT** alter existing Alembic migration `0001_initial_baseline.py`.
- **Do NOT** force-push to `integration` or `main`.
