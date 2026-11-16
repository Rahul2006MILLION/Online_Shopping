# BASKET — Changelog

All notable changes to the BASKET project are documented in this file.
Format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — Phase 1 Commerce Implementation (Planned)

### Planned
- **Catalogue & Search:**
  - Product browse and category taxonomy endpoints.
  - OpenSearch cluster indexing pipeline and search endpoints (`/api/v1/search`).
  - Product detail and variant resolution in PostgreSQL.
- **Cart & Inventory:**
  - Server-persisted cart with session/user scoping.
  - Multi-item all-or-nothing atomic inventory reservations.
  - Sorted row-locking to prevent concurrent checkout deadlocks.
- **Checkout & Orders:**
  - HMAC-signed checkout quotes with 5-minute expiry.
  - Server-authoritative checkout validation against PostgreSQL.
  - Order state machine (`PENDING_PAYMENT`, `CONFIRMED`, `CANCELLED`, `PAYMENT_FAILED`).
  - Idempotent request replay via `idempotency_records`.
- **Eventing & Reliability:**
  - Transactional outbox table (`outbox_events`).
  - Background outbox publisher with lease-based concurrency fencing.
  - Asynchronous OpenSearch indexing consumer.

---

## [Handoff Baseline] — 2026-11-16

### Added
- **Developer Handoff Documentation:**
  - Created `PROJECT_STATUS.md` detailing component status and evidence.
  - Created `DEVELOPER_HANDOFF.md` providing comprehensive onboarding guidance.
  - Created `CONTRIBUTING.md` defining branching, git, testing, and migration workflows.
  - Created `docs/NEW_DEVELOPER_QUICKSTART.md` for one-command local onboarding.
  - Created `docs/ENVIRONMENT_SETUP.md` covering secrets, SSL, and Aiven cloud configuration.
  - Created `docs/IMPLEMENTATION_ROADMAP.md` tracking project phases from 0 through E.
  - Consolidated `README.md`, `ARCHITECTURE.md`, `API_CONTRACTS.md`, `DATA_MODEL.md`, `TASK_BREAKDOWN.md`, and `QUALITY_GATES.md`.

---

## [Phase 0 Foundation] — 2026-11-16

Merged into `integration` via Pull Request #1 (`db9d790`).

### Added
- **Monorepo Baseline Initialization (`2495f11`):**
  - FastAPI modular monolith backend with lifespan context manager and structured logging.
  - SQLAlchemy 2.0 async engine and session factory with PostgreSQL SSL support.
  - Alembic database migration environment and baseline marker (`0001_initial_baseline.py`).
  - Next.js 15 App Router frontend with React 19, TypeScript strict mode, and Tailwind CSS.
  - shadcn/ui component primitives (`Button`, `Card`, `Badge`) and layout components.
  - Centralized typed API client (`frontend/lib/api/client.ts`).
  - Verification scripts: `scripts/dev-setup.sh` and `scripts/verify-environment.sh`.
- **Foundation P1 Remediation (`9edeabd`):**
  - **SEC-01 (Readiness Probe):** Enhanced `/ready` probe to return HTTP 503 on database disconnection or check error, HTTP 200 with degraded status in unconfigured development, and HTTP 503 in production.
  - **SEC-02 (SQLite Test Engine):** Prevented unsupported PostgreSQL connection pool arguments (`pool_size`, `max_overflow`) from being passed to SQLite in-memory test engines.
  - **SEC-03 (API Client Methods):** Implemented `PATCH` and `DELETE` (supporting both HTTP 204 No Content and HTTP 200 with body) methods on `ApiClient`.
  - Added unit test suites for API client, database engines, and readiness probe edge cases.
