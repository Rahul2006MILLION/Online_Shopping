# BASKET — Project Status Report

> **Last Updated:** 2026-11-16T18:50:00+05:30  
> **Current Git Branch:** `docs/developer-handoff` (derived from `integration`)  
> **Current Baseline Commit:** `db9d790` (Merge pull request #1 from `feature/phase0-foundation`)  
> **Current Milestone:** Phase 0 Completed / Phase 1 Pre-Implementation Handoff  

---

## 1. Executive Summary

BASKET is currently at the transition point between **Phase 0 (Foundation Baseline)** and **Phase 1 (Core Commerce Implementation)**.

- **Phase 0 (Foundation):** **COMPLETED & VERIFIED**. The monorepo structure, Next.js 15 frontend shell, FastAPI modular monolith backend, SQLAlchemy 2 async database engine, Alembic migration harness, centralized typed API client, health/readiness probes, and verification scripts are fully implemented, tested, and merged into `integration` via PR #1.
- **Phase 1 (Core Commerce):** **PLANNED / NOT STARTED IN CODE**. Architecture proposals and work splits have been defined and reviewed in `AGENT_HANDOFF.md`. No commerce application code, domain modules, commerce database tables, or Kafka/OpenSearch workers have been implemented in the codebase yet.
- **Outstanding Architectural Decisions:** 10 schema and concurrency items require formal sign-off before freezing contracts and applying database migrations.

---

## 2. Component Implementation Status Table

| Component / Subsystem | Documented Scope | Actual Repository Status | Status | Verification Evidence |
|---|---|---|---|---|
| **FastAPI Monolith Shell** | App factory, lifespan, CORS, logging, exception handlers, request ID middleware | Fully implemented in `backend/app/main.py` | `COMPLETED` | `backend/tests/test_health.py`, `backend/tests/test_exceptions.py` (12 tests pass) |
| **Health & Readiness Probes** | `/health` (liveness), `/ready` (dependency check, DB ping, safe error reporting) | Fully implemented with HTTP 200/503 semantics and development mode degradation | `COMPLETED` | `test_readiness_connected`, `test_readiness_unconfigured_development`, `test_readiness_unconfigured_production`, `test_readiness_unreachable` |
| **Database Engine Lifecycle** | SQLAlchemy 2.0 async engine, session factory, PostgreSQL Aiven SSL, SQLite test fallback | Fully implemented in `backend/app/core/database.py` | `COMPLETED` | `backend/tests/test_database.py` (engine creation, connection pooling tests pass) |
| **Database Migrations (Alembic)** | 17 core relational tables for commerce | Alembic initialized; only `0001_initial_baseline.py` (empty baseline marker) exists | `PARTIAL` | `backend/alembic/versions/0001_initial_baseline.py` exists; `alembic heads` shows clean head. No commerce tables applied. |
| **Catalogue & Search Backend** | `/products`, `/categories`, `/search`, OpenSearch query integration | `backend/app/modules/` is empty; no catalogue or search routes exist | `NOT STARTED` | Repository inspection shows no files in `backend/app/modules/` |
| **Cart & Inventory Backend** | `/cart`, `/inventory`, atomic row-level reservation locking | Not implemented in codebase | `NOT STARTED` | No files in `backend/app/modules/cart` or `backend/app/modules/inventory` |
| **Checkout & Orders Backend** | `/checkout/quote`, `/checkout`, `/orders`, state machine | Not implemented in codebase | `NOT STARTED` | No files in `backend/app/modules/orders` or `backend/app/modules/checkout` |
| **Transactional Outbox & Kafka** | `outbox_events` table, leased publisher daemon, Kafka producer/consumer | Not implemented in codebase; `aiokafka` not yet installed | `NOT STARTED` | `requirements.txt` does not contain `aiokafka`; no outbox worker script |
| **OpenSearch Indexing Sync** | Asynchronous Kafka consumer updating `basket_products` | Not implemented in codebase; `opensearch-py` not yet installed | `NOT STARTED` | `requirements.txt` does not contain `opensearch-py`; no indexer script |
| **Next.js 15 Frontend Shell** | App router, Tailwind CSS, shadcn/ui primitives, Header, Footer, System Status widget | Fully implemented; home page probes `/health` and `/ready` with status badges | `COMPLETED` | `frontend/app/page.tsx`, `frontend/components/shared/system-status.tsx`, production build passes |
| **Frontend Centralized API Client** | Typed fetch wrapper supporting GET, POST, PATCH, DELETE, custom `ApiClientError` | Fully implemented in `frontend/lib/api/client.ts` with unit test suite | `COMPLETED` | `frontend/lib/api/client.test.ts` (7 tests pass via `npm test`) |
| **Frontend Commerce Features** | Catalogue browser, search page, cart drawer, checkout flow, order status | `frontend/features/` directory is empty | `NOT STARTED` | Repository inspection shows `frontend/features/` is empty |
| **Infrastructure Integration** | Live Aiven PostgreSQL, Kafka, OpenSearch services | Configuration placeholders in `infra/.env.example`; no live credentials stored | `PLANNED` | `infra/.env.example`, `backend/app/core/config.py` |
| **Verification & Tooling** | One-command bootstrap and verification scripts | Implemented in `scripts/dev-setup.sh` and `scripts/verify-environment.sh` | `COMPLETED` | `./scripts/verify-environment.sh` passes all lint, type-check, build, and test gates |

---

## 3. Known Technical Debt & Unverified Areas

1. **Aiven Cloud Integration Unverified:**
   - The application has been verified against SQLite in memory and tested for PostgreSQL engine construction.
   - It has **not** been connected to live Aiven PostgreSQL, Kafka, or OpenSearch clusters because cloud credentials have not yet been provided to the repository environment.
2. **Phase 1 Dependency Installation:**
   - `aiokafka` and `opensearch-py` have been verified for version compatibility with Python 3.12, but they are deliberately not yet added to `pyproject.toml` or `requirements.txt` pending Phase 1 branch kickoff.
3. **TypeScript Module Typeless Package Warning:**
   - Running `npm test` triggers a Node warning: `MODULE_TYPELESS_PACKAGE_JSON` for `client.test.ts`. This does not break execution (all 7 tests pass), but adding `"type": "module"` or configuring ts-node/vitest is a minor technical debt item.
4. **Mock Payment Fallback:**
   - No payment integration exists. Razorpay Sandbox remains a planned future integration. No mocked payment redirect or fake payment success may be shown to customers.

---

## 4. Outstanding Schema & Concurrency Decisions

Before beginning Phase 1 database migration authoring, the following 10 items must be formally signed off by the team:

1. **Reservation Schema Mismatch:**
   - Reconcile whether `inventory_reservations` contains `listing_id` and `quantity` directly (1 reservation per item) or parent `inventory_reservations` + `reservation_items` (1 reservation per order).
2. **Checkout Insertion Order & Foreign Keys:**
   - Resolve circularity between `orders` and `inventory_reservations` by inserting `orders` with `status = 'PENDING_PAYMENT'` before inserting child reservations with `order_id`.
3. **Search Projection Versioning Across Event Types:**
   - Standardize on monotonic millisecond timestamps (`occurred_at_ms`) for `version_type=external_gte` in OpenSearch so catalogue updates and inventory threshold updates do not conflict.
4. **Atomic Idempotency Claims Under Concurrency:**
   - Catch unique constraint violations on `idempotency_records` during concurrent checkouts and return `409 Conflict (REQUEST_IN_PROGRESS)` with a `Retry-After` header.
5. **Quote Binding to Cart Identity:**
   - Formally decide whether `POST /checkout/quote` binds to a specific `cart_id` and `cart_version` or purely to an immutable list of items.
6. **Guest Session Retention & Historical Order Ownership:**
   - Define data retention duration for `guest_sessions` and the reconciliation procedure when a guest subsequently creates a registered account using the same email address.
7. **Atomic Reservation Expiry & Order Cancellation:**
   - Ensure the reservation expiry daemon transitions `inventory_reservations.status = 'EXPIRED'`, updates `store_inventory.reserved_quantity`, sets `orders.status = 'CANCELLED'`, and records `order.cancelled` in `outbox_events` in a single transaction.
8. **Outbox Schema Completeness:**
   - Confirm explicit `topic VARCHAR(100)` and `partition_key VARCHAR(255)` columns on `outbox_events`.
9. **Dead Letter Queue (DLQ) Acknowledgement:**
   - Specify DLQ routing, consumer offset commit upon DLQ dispatch, and the manual/automated replay CLI.
10. **Listing Entity Naming:**
    - Standardize on `store_listings` across all documentation, database tables, and API contracts (retiring the alias `retailer_listings`).
