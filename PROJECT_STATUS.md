# BASKET — Project Status Report

> **Last Updated:** 2026-11-16T19:10:00+05:30  
> **Current Git Branch:** `docs/developer-handoff-fix` (derived from `docs/developer-handoff`)  
> **Current Baseline Commit:** `db9d790` (Merge pull request #1 from `feature/phase0-foundation`)  
> **Current Milestone:** Phase 0 Completed / Phase 1 Pre-Implementation Architecture Review  

---

## 1. Executive Summary

BASKET is at the transition point between **Phase 0 (Foundation Baseline)** and **Phase 1 (Core Commerce Implementation)**.

- **Phase 0 (Foundation):** **`COMPLETED & VERIFIED`**. The monorepo structure, Next.js 15 frontend shell, FastAPI modular monolith backend, SQLAlchemy 2 async database engine, Alembic baseline marker, centralized typed API client, health/readiness probes, and verification scripts are fully implemented, tested, and merged into `integration` via PR #1.
- **Phase 1 (Core Commerce):** **`PLANNED / PROPOSED ARCHITECTURE UNDER REVIEW`**. Architecture proposals and work splits have been defined and reviewed in `AGENT_HANDOFF.md`. **No commerce application code, domain modules, commerce database tables, or Kafka/OpenSearch workers have been implemented in the codebase yet.**
- **Alembic Migration 0002:** **`NOT STARTED / BLOCKED`**. Migration `0002_phase1_commerce_schema.py` must NOT be authored directly from draft DDL until the 10 open design decisions are formally approved and contracts are frozen.
- **Outstanding Architectural Decisions:** 10 schema and concurrency items require formal sign-off before freezing contracts and applying database migrations.

---

## 2. Component Implementation Status Table

| Component / Subsystem | Documented Scope | Actual Repository Status | Status | Verification Evidence |
|---|---|---|---|---|
| **FastAPI Monolith Shell** | App factory, lifespan, CORS, logging, exception handlers, request ID middleware | Fully implemented in `backend/app/main.py` | `COMPLETED` | `backend/tests/test_health.py`, `backend/tests/test_exceptions.py` (12 tests pass) |
| **Health & Readiness Probes** | `/health` (liveness), `/ready` (dependency check, DB ping, safe error reporting) | Fully implemented with HTTP 200/503 semantics and development mode degradation | `COMPLETED` | `test_readiness_connected`, `test_readiness_unconfigured_development`, `test_readiness_unconfigured_production`, `test_readiness_unreachable` |
| **Database Engine Lifecycle** | SQLAlchemy 2.0 async engine, session factory, PostgreSQL Aiven SSL, SQLite test fallback | Fully implemented in `backend/app/core/database.py` | `COMPLETED` | `backend/tests/test_database.py` (engine creation, connection pooling tests pass) |
| **Database Migrations (Alembic)** | Core relational commerce tables | Alembic initialized; only `0001_initial_baseline.py` (empty baseline marker) exists | `PARTIAL` | `backend/alembic/versions/0001_initial_baseline.py` exists; `alembic heads` shows clean head. No commerce tables applied. |
| **Catalogue & Search Backend** | `/products`, `/categories`, `/search`, OpenSearch query integration | `backend/app/modules/` is empty; no catalogue or search routes exist | `NOT STARTED` | Repository inspection shows no files in `backend/app/modules/` |
| **Cart & Inventory Backend** | `/cart`, `/inventory`, atomic row-level reservation locking | Not implemented in codebase | `NOT STARTED` | No files in `backend/app/modules/cart` or `backend/app/modules/inventory` |
| **Checkout & Orders Backend** | `/checkout/quote`, `/checkout`, `/orders`, state machine | Not implemented in codebase | `NOT STARTED` | No files in `backend/app/modules/orders` or `backend/app/modules/checkout` |
| **Transactional Outbox & Kafka** | `outbox_events` table, leased publisher daemon, Kafka producer/consumer | Not implemented in codebase; `aiokafka` not yet installed | `NOT STARTED` | `requirements.txt` does not contain `aiokafka`; no outbox worker script |
| **OpenSearch Indexing Sync** | Asynchronous Kafka consumer updating `basket_products` | Not implemented in codebase; `opensearch-py` not yet installed | `NOT STARTED` | `requirements.txt` does not contain `opensearch-py`; no indexer script |
| **Next.js 15 Frontend Shell** | App router, Tailwind CSS, shadcn/ui primitives, Header, Footer, System Status widget | Fully implemented; home page probes `/health` and `/ready` with status badges | `COMPLETED` | `frontend/app/page.tsx`, `frontend/components/shared/system-status.tsx`, production build passes |
| **Frontend Centralized API Client** | Typed fetch wrapper supporting GET, POST, PATCH, DELETE, custom `ApiClientError` | Fully implemented in `frontend/lib/api/client.ts` with unit test suite | `COMPLETED` | `frontend/lib/api/client.test.ts` (7 tests pass via `npm test`) |
| **Frontend Commerce Features** | Catalogue browser, search page, cart drawer, checkout flow, order status | `frontend/features/` directory is empty | `NOT STARTED` | Repository inspection shows `frontend/features/` is empty |
| **Infrastructure Integration** | Live Aiven PostgreSQL, Kafka, OpenSearch services | Configuration placeholders in `infra/.env.example`; no live credentials stored | `PLANNED` | `infra/.env.example`, `backend/app/core/config.py`. Live cloud integration NOT verified. |
| **Verification & Tooling** | One-command bootstrap and verification scripts | Implemented in `scripts/dev-setup.sh` and `scripts/verify-environment.sh` | `COMPLETED` | `./scripts/verify-environment.sh` passes all lint, type-check, build, and test gates |

---

## 3. Known Technical Debt & Unverified Areas

1. **Aiven Cloud Integration Unverified:**
   - The application has been verified against SQLite in memory and tested for PostgreSQL engine construction.
   - It has **not** been connected to live Aiven PostgreSQL, Kafka, or OpenSearch clusters because cloud credentials have not yet been provided to the repository environment.
2. **Phase 1 Dependency Installation:**
   - `aiokafka` and `opensearch-py` are deliberately not yet added to `pyproject.toml` or `requirements.txt` pending Phase 1 contract freeze.
3. **TypeScript Module Typeless Package Warning:**
   - Running `npm test` triggers a Node warning: `MODULE_TYPELESS_PACKAGE_JSON` for `client.test.ts`. This does not break execution (all 7 tests pass).
4. **Mock Payment Fallback:**
   - No payment integration exists. Razorpay Sandbox remains a planned future integration. No mocked payment redirect or fake payment success may be shown to customers.

---

## 4. Outstanding Architectural Decisions & Detailed Status

Before beginning Phase 1 database migration authoring, the following 10 items must be formally reviewed and signed off by the team:

1. **Reservation Schema Model (Parent-Child Standardized in Proposal):**
   - **Resolution:** A flat reservation model is **NOT approved**. The proposed architecture standardizes on a parent `inventory_reservations` table (storing `order_id`, `status`, `expires_at`, `confirmed_at`) and child `reservation_items` (storing `reservation_id`, `listing_id`, `quantity`).
   - **Status:** Standardized in proposal; awaiting formal sign-off.
2. **Checkout Insertion Order & Foreign Keys:**
   - **Resolution:** `orders` is inserted first with status `PENDING_PAYMENT`, followed by child `inventory_reservations` referencing `orders.id` and `reservation_items` referencing `inventory_reservations.id`.
   - **Status:** Reconciled in proposal; awaiting formal sign-off.
3. **Search Projection Versioning (PENDING DESIGN — MONOTONIC VERSION REQUIRED):**
   - **Resolution:** Timestamp-based OpenSearch versioning (`occurred_at_ms`) is **REJECTED** due to clock drift across distributed workers. The design requires a **monotonic per-product projection version** (`products.projection_version INT` incremented in PostgreSQL on every product/listing/price/threshold change) passed in domain events and used as OpenSearch `version_type=external_gte`.
   - **Status:** Pending design under review; awaiting formal sign-off.
4. **Atomic Idempotency Claims Under Concurrency (EXPLICITLY UNRESOLVED):**
   - **Resolution:** When concurrent checkout requests arrive with the exact same idempotency key, how does the system arbitrate? Catching unique key collisions on `idempotency_records` vs row-level locking needs formal performance and edge-case agreement.
   - **Status:** Explicitly unresolved; awaiting team decision.
5. **Quote Binding to Cart Identity (EXPLICITLY UNRESOLVED):**
   - **Resolution:** Does `POST /checkout/quote` bind to a specific `(cart_id, cart_version)` or purely to an immutable list of items?
   - **Status:** Explicitly unresolved; awaiting team decision.
6. **Guest Session Retention & Historical Linking (EXPLICITLY UNRESOLVED):**
   - **Resolution:** Define TTL retention policies for `guest_sessions` and the reconciliation procedure when a guest subsequently creates a registered account using the same email address.
   - **Status:** Explicitly unresolved; awaiting team decision.
7. **Atomic Reservation Expiry & Order Cancellation (EXPLICITLY UNRESOLVED):**
   - **Resolution:** Coordination mechanism for the background expiry daemon to sweep expired reservations, replenish `store_inventory.reserved_quantity`, set `orders.status = 'CANCELLED'`, and emit `order.cancelled` via outbox in a single transaction.
   - **Status:** Explicitly unresolved; awaiting team decision.
8. **Outbox Schema Completeness (PROPOSED):**
   - **Resolution:** Confirm explicit `topic VARCHAR(100)` and `partition_key VARCHAR(255)` columns on `outbox_events`.
   - **Status:** Proposed in draft DDL; awaiting sign-off.
9. **Dead Letter Queue (DLQ) Acknowledgement (EXPLICITLY UNRESOLVED):**
   - **Resolution:** Specify DLQ topic routing, Kafka offset committing upon DLQ dispatch, and the manual/automated replay CLI.
   - **Status:** Explicitly unresolved; awaiting team decision.
10. **Listing Entity Naming (STANDARDIZED IN PROPOSAL):**
    - **Resolution:** Standardize on `store_listings` across all documentation, database tables, and API contracts (retiring the alias `retailer_listings`).
    - **Status:** Standardized in proposal; awaiting sign-off.
