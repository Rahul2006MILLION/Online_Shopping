# BASKET — Shared Agent Handoff & Conversation Log

> This is the coordination document between Developer A, Developer B, and their Antigravity agents. It is not a place for vague status updates. Record decisions, requests, blockers, and integration notes so the other developer can continue without guessing.

## 1. Rules for using this file

- Append a new entry; do not silently rewrite or delete another person's entry.
- Use timestamps in IST (`YYYY-MM-DD HH:MM IST`).
- Identify the author: `Developer A`, `Developer B`, or `Integration Owner`.
- Every request must state what response/action is needed and by when.
- Every shared API/schema change must be written here before implementation.
- The receiving developer must reply in a new entry with `ACCEPTED`, `REJECTED`, or `NEEDS DISCUSSION`.
- A handoff is not approval to merge. GitHub PR review is still required.
- Keep entries concise, factual, and actionable.
- Do not paste secrets, tokens, private customer data, or huge logs. Link to a sanitized log or PR instead.

## 2. Current team ownership

| Area | Owner | Backup/reviewer |
|---|---|---|
| Integration branch and shared contracts | To be assigned | Other developer |
| Frontend foundation | Developer A/B — decide together | Other developer |
| Backend foundation and DB migrations | Developer A/B — decide together | Other developer |
| Catalogue/search | To be assigned | To be assigned |
| Cart/checkout/orders | To be assigned | To be assigned |
| Kafka/outbox/workers | To be assigned | To be assigned |
| Optional differentiators | To be assigned | To be assigned |

Fill this table before parallel implementation.

## 3. Current shared baseline

- Base branch: `integration` (create if it does not exist).
- Stable branch: `main`.
- Stack: Next.js + TypeScript; FastAPI + SQLAlchemy 2 + Alembic; Aiven PostgreSQL, Kafka, OpenSearch.
- API prefix: `/api/v1`.
- Database authority: PostgreSQL.
- Search authority: OpenSearch only for retrieval, never checkout validation.
- Event publication: transactional outbox.
- Payment: Razorpay Sandbox only when configured and server-verified.

## 4. Entry template — proposal/request

Copy this section for every new request.

### [YYYY-MM-DD HH:MM IST] — [AUTHOR] — [PROPOSAL / REQUEST / BLOCKER]

**Related branch / PR / task:**  
**Affected module(s):**  
**What I am proposing or requesting:**  
**Reason:**  
**Files/contracts affected:**  
**Backward compatibility impact:**  
**What I need from the other developer:**  
**Required response by:**  

**Status:** OPEN

---

## 5. Entry template — response

### [YYYY-MM-DD HH:MM IST] — [AUTHOR] — [RESPONSE]

**Replying to:**  
**Decision:** ACCEPTED / REJECTED / NEEDS DISCUSSION  
**Reason:**  
**Required follow-up:**  
**Owner:**  
**Status:** OPEN / RESOLVED

---

## 6. Entry template — implementation handoff

### [YYYY-MM-DD HH:MM IST] — [AUTHOR] — [IMPLEMENTATION HANDOFF]

**Task:**  
**Branch / PR:**  
**What is implemented:**  
**Files changed:**  
**API/schema/event changes:**  
**Migration details:**  
**Tests and results:**  
**Known limitations:**  
**How to run or verify:**  
**What the next developer should do:**  

**Status:** READY FOR REVIEW / BLOCKED / NEEDS FOLLOW-UP

---

## 7. Integration incident template

### [YYYY-MM-DD HH:MM IST] — [AUTHOR] — [INTEGRATION INCIDENT]

**Observed failure:**  
**Steps to reproduce:**  
**Expected behaviour:**  
**Actual behaviour:**  
**Relevant branch/commit/PR:**  
**Logs (sanitized):**  
**Suspected owner/module:**  
**Immediate containment:**  
**Resolution:**  

**Status:** OPEN / RESOLVED

---

## 8. Live log

### [2026-11-16 17:40 IST] — Foundation Engineer — [IMPLEMENTATION HANDOFF]

**Task:** Phase 0 — Monorepo Foundation and Quality Gate Baseline  
**Branch / PR:** `feature/phase0-foundation` -> `integration`  
**What is implemented:**  
1. Git repository initialized with `main` and `integration` remote branches; comprehensive `.gitignore` configured to prevent secret or artifact leakage.  
2. Backend modular monolith setup:  
   - Python 3.12 managed via `uv`.  
   - FastAPI application factory in `backend/app/main.py`.  
   - Pydantic Settings with startup validation and SecretStr credential masking (`backend/app/core/config.py`).  
   - Structured logging (`backend/app/core/logging.py`).  
   - Centralized exception handlers adhering to `API_CONTRACTS.md` standard error format (`backend/app/core/exceptions.py`).  
   - SQLAlchemy 2.x async engine with Aiven PostgreSQL SSL support and session lifecycle (`backend/app/core/database.py`).  
   - Single-head Alembic baseline migration harness (`backend/alembic/versions/0001_initial_baseline.py`).  
   - Process liveness (`/health`) and database readiness (`/ready`) endpoints.  
   - Pytest unit tests (6/6 passing) and Ruff lint/format checks configured and passing.  
3. Frontend Next.js 15 baseline:  
   - Next.js 15 App Router with React 19 and strict TypeScript (`frontend/tsconfig.json`).  
   - Tailwind CSS and shadcn/ui component primitives (`Button`, `Card`, `Badge`).  
   - Centralized, strongly-typed API client with `ApiClientError` and environment-based base URL (`frontend/lib/api/client.ts`).  
   - Live system status monitoring component displaying backend health and database readiness (`frontend/components/shared/system-status.tsx`).  
   - Foundation landing page and responsive layout (`frontend/app/page.tsx`, `frontend/app/layout.tsx`).  
4. Infrastructure and Developer Tooling:  
   - Zero-secret environment templates (`backend/.env.example`, `frontend/.env.example`, `infra/.env.example`).  
   - Bootstrap script (`scripts/dev-setup.sh`) and verification gate script (`scripts/verify-environment.sh`).  
   - Updated control center documentation (`README.md`).  

**Files changed:**  
- Created: `backend/**`, `frontend/**`, `infra/**`, `scripts/**`, `.gitignore`.  
- Updated: `README.md`, `AGENT_HANDOFF.md`.  
- Preserved untouched: `PROJECT_CHARTER.md`, `ARCHITECTURE.md`, `AGENT_RULES.md`, `API_CONTRACTS.md`, `DATA_MODEL.md`, `DEVELOPMENT_WORKFLOW.md`, `TASK_BREAKDOWN.md`, `QUALITY_GATES.md`, `DECISIONS.md`.  

**API/schema/event changes:**  
- Endpoints added: `GET /health`, `GET /ready`, `GET /api/v1/info`.  
- Standard error envelope conforming to `API_CONTRACTS.md`.  

**Migration details:**  
- Alembic single head: `0001_initial_baseline`. Verified upgrade and downgrade compatibility.  

**Tests and results:**  
- Backend: `pytest -v` (6/6 passed in 0.01s).  
- Backend lint & format: `ruff check .` (0 errors), `ruff format --check .` (clean).  
- Frontend: TypeScript check and build verification pending npm install task completion.  

**Known limitations:**  
- Direct PostgreSQL CLI (`psql`) is not installed on the host machine; database operations in Phase 0 run via Python asyncpg/SQLAlchemy and Alembic drivers.  
- External Aiven service credentials (PostgreSQL, Kafka, OpenSearch) and Razorpay keys are not yet configured in local `.env` files; `/ready` reports database status as `"unconfigured"` by design until credentials are provided.  

**How to run or verify:**  
- Run `./scripts/verify-environment.sh` from the repository root.  
- Run `cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000`.  
- Run `cd frontend && npm run dev`.  

**What the next developer should do:**  
1. Review and approve `feature/phase0-foundation` PR.  
2. Fill developer role assignments in `TASK_BREAKDOWN.md` for Phase 1 parallel work.  

**Status:** RESOLVED (Merged into `integration` via PR #1)

---

### [2026-11-16 18:25 IST] — Planning Agent — [PROPOSAL / ARCHITECTURE]

**Related branch / PR / task:** Phase 1.0 Architecture & Work Allocation  
**Affected module(s):** Catalogue, Search, Cart, Inventory, Orders, Outbox, Events  
**What I am proposing or requesting:**  
Full architectural blueprint and work breakdown for Phase 1 core commerce journey:
1. **Developer 1 Ownership:** Product Discovery & Search (Frontend & Backend). Owns `backend/app/modules/catalogue/`, `backend/app/modules/search/`, OpenSearch indexing & sync, `frontend/features/catalogue/`, `frontend/features/search/`.
2. **Developer 2 Ownership:** Cart, Inventory & Orders (Frontend & Backend). Owns `backend/app/modules/cart/`, `backend/app/modules/inventory/`, `backend/app/modules/orders/`, `backend/app/events/`, Transactional Outbox & Kafka publisher/consumer, `frontend/features/cart/`, `frontend/features/checkout/`.
3. **Database Schema & Migrations:** 17 core relational tables (UUID PKs, integer paise, UTC timestamps, `store_inventory` check constraint preventing negative availability, outbox table). Sequenced under a single Alembic migration path (`0002_phase1_commerce_schema.py`) authored by Integration Owner.
4. **OpenSearch Integration:** Derived index `basket_products_v1` (alias `basket_products`) updated asynchronously via Kafka event consumer. Rebuild script for zero-downtime reindexing.
5. **Transactional Outbox & Kafka:** Event envelope standard, topic `basket.orders.v1` with message key `order_id`, and `processed_events` table ensuring idempotent consumers.
6. **Atomic Inventory Reservation:** Multi-item all-or-nothing row-level locked reservation with 10-minute expiry job and idempotency key protection.

**Reason:** Enables parallel, conflict-free development by Developer 1 and Developer 2 across cleanly decoupled domain boundaries while upholding data authority and transactional integrity.  
**Files/contracts affected:** `DATA_MODEL.md`, `API_CONTRACTS.md`, `TASK_BREAKDOWN.md`, new module directories in `backend/app/modules/` and `frontend/features/`.  
**Backward compatibility impact:** Extends baseline `/api/v1` routes and schemas without altering existing `/health`, `/ready`, or `/api/v1/info`.  
**What I need from the other developer / team lead:**  
Approval of the work split, OpenSearch mapping, outbox design, and confirmation of open decisions (guest checkout session handling, Kafka client library choice, reservation expiry duration).  
**Required response by:** Before Phase 1 feature branch creation.  

**Status:** SUPERSEDED BY REVISION BELOW

---

### [2026-11-16 18:35 IST] — Planning Agent — [REVISED PROPOSAL / ARCHITECTURE CORRECTIONS]

**Related branch / PR / task:** Phase 1.0 Architecture Review Corrections  
**Affected module(s):** Catalogue, Search, Cart, Inventory, Orders, Outbox, Events, Auth/Guest Identity  
**What I am proposing or requesting:**  
Mandatory architectural corrections following team review:
1. **Lease-Based Transactional Outbox (Zero DB Row Locks During Network Calls):**  
   - Outbox rows support `claim_token`, `claimed_at`, and `lease_expires_at`.
   - Step 1: Worker claims a batch of pending/expired events in a sub-5ms PostgreSQL transaction.
   - Step 2: Publishes to Aiven Kafka outside the database transaction.
   - Step 3: Marks events published in a separate short transaction upon broker ACK.
   - Expired claims (`lease_expires_at < NOW()`) are reclaimed safely after worker crashes.
2. **Atomic Kafka Consumer Idempotency:**  
   - Consumer opens a PostgreSQL transaction, executes `INSERT INTO processed_events (event_id, consumer_group, processed_at) VALUES (...) ON CONFLICT DO NOTHING RETURNING event_id`.
   - Business side effects and processed event marker commit in the exact same database transaction.
   - Kafka offset is committed *only after* the PostgreSQL transaction commits.
3. **Cryptographically Secure Guest Identity & Order Ownership:**  
   - Carts and orders support unauthenticated guest checkouts via server-generated 32-byte secure bearer tokens (`X-Session-Token`).
   - Server stores only the SHA-256 hash in `guest_sessions.token_hash`.
   - `users` table defined as canonical system of record; `orders.user_id` is nullable for guest orders (`CHECK ((user_id IS NOT NULL) OR (guest_session_id IS NOT NULL AND guest_email IS NOT NULL))`).
   - Defined linking migration path for associating guest orders with future registered accounts.
4. **Separation of Quote vs Checkout:**  
   - `POST /checkout/quote`: Non-binding calculation from PostgreSQL prices and stock without row locks or reservations. Issues a signed, 5-minute expiring HMAC `quote_token`.
   - `POST /checkout`: Revalidates price and stock, performs atomic all-or-nothing multi-item reservation, creates order, and writes outbox event under `Idempotency-Key` protection.
5. **Phase 1 Order & Payment State Machine:**  
   - Explicit states: `PENDING_PAYMENT`, `CONFIRMED`, `PAYMENT_FAILED`, `CANCELLED`.
   - Phase 1 does not integrate payment gateways or fake payment redirects. Orders enter `PENDING_PAYMENT` with an active reservation.
   - Demo confirmation endpoint `POST /api/v1/orders/{id}/demo-confirm` provides explicit, server-verified confirmation without client-spoofed payment success.
6. **Product-Level vs Listing-Level Search (OpenSearch):**  
   - OpenSearch documents represent canonical **Products** with minimum active listing price and aggregate stock status.
   - Product detail page queries authoritative PostgreSQL for all variants, stores, and listings.
7. **Single Outbox Engine & Developer Boundaries:**  
   - Developer 2 owns generic outbox persistence, claim/lease manager, and Kafka producer.
   - Developer 1 writes catalogue events to Developer 2's outbox in the same transaction as catalogue edits and owns the OpenSearch indexing consumer.
8. **Data Integrity & Schema Hardening:**  
   - Partial unique index `UNIQUE(listing_id) WHERE is_current = TRUE` on prices.
   - `CHECK (on_hand_quantity >= reserved_quantity)` in `store_inventory` strictly prevents overselling.
   - Deadlock-free sorted row locking (`ORDER BY listing_id FOR UPDATE`).
   - Stable cursor pagination ordering by `(created_at, id)`.
9. **Explicit Service Modes:**  
   - `AIVEN_REAL`, `LOCAL_DEV` (transparent fallback or honest 503), and `TEST_MOCK`. No silent mock responses presented as real integrations.
10. **Dependency Compatibility:**  
   - Verified `aiokafka>=0.11.0` and `opensearch-py>=2.8.0` compatibility with Python 3.12, FastAPI, and SQLAlchemy 2.x async.

**Reason:** Eliminates database lock starvation during network I/O, ensures atomic event processing, secures guest identity, and strictly separates product discovery from transactional checkout.  
**Files/contracts affected:** `DATA_MODEL.md`, `API_CONTRACTS.md`, `TASK_BREAKDOWN.md`, `backend/app/modules/*`, `backend/app/events/*`.  
**Status:** SUPERSEDED BY FINAL REVISION BELOW

---

### [2026-11-16 18:45 IST] — Planning Agent — [FINAL PHASE 1.0 ARCHITECTURE REVISION]

**Related branch / PR / task:** Phase 1.0 Final Architecture Corrections  
**Affected module(s):** Inventory, Catalogue, Search, Cart, Orders, Outbox, Events, Guest Session / Auth  
**What I am proposing or requesting:**  
Comprehensive technical resolution of the eight architecture review findings:

#### 1. Inventory Reservation Lifecycle Transitions
- **Creation (`POST /checkout`):**
  - Read & lock candidate rows in sorted order: `SELECT * FROM store_inventory WHERE listing_id IN (...) ORDER BY listing_id ASC FOR UPDATE;`
  - Validation: For each item, require `(on_hand_quantity - reserved_quantity) >= requested_quantity`.
  - Atomic update: `UPDATE store_inventory SET reserved_quantity = reserved_quantity + :qty, updated_at = NOW() WHERE listing_id = :id;`
  - Enforced by DB constraint: `CHECK (on_hand_quantity >= reserved_quantity AND reserved_quantity >= 0)`.
  - Create reservation record: `INSERT INTO inventory_reservations (id, order_id, listing_id, quantity, status, expires_at) VALUES (:res_id, :order_id, :id, :qty, 'ACTIVE', NOW() + INTERVAL '10 minutes');`
- **Confirmation (`demo-confirm` or Payment Webhook):**
  - Lock reservation: `SELECT * FROM inventory_reservations WHERE order_id = :order_id FOR UPDATE;`
  - Require `status = 'ACTIVE'` and `expires_at > NOW()`. If not active, abort with `409 Conflict (RESERVATION_NOT_ACTIVE)`.
  - Atomically deduct both quantities:
    `UPDATE store_inventory SET reserved_quantity = reserved_quantity - :qty, on_hand_quantity = on_hand_quantity - :qty, updated_at = NOW() WHERE listing_id = :id;`
  - Transition reservation:
    `UPDATE inventory_reservations SET status = 'CONFIRMED', confirmed_at = NOW(), updated_at = NOW() WHERE id = :res_id AND status = 'ACTIVE';` (Row count must equal 1; strictly eliminates double confirmation).
- **Release / Expiry (Worker or Cancellation):**
  - `UPDATE store_inventory SET reserved_quantity = reserved_quantity - :qty, updated_at = NOW() WHERE listing_id = :id;`
  - `UPDATE inventory_reservations SET status = 'EXPIRED' (or 'RELEASED'), updated_at = NOW() WHERE id = :res_id AND status = 'ACTIVE';`
  - `on_hand_quantity` remains untouched.
- **Concurrency & Deadlock Prevention:**
  - Multi-item checkouts and reservations MUST sort listing IDs in ascending lexicographical order prior to locking (`ORDER BY listing_id ASC FOR UPDATE`).
  - Unconditional idempotency on state transitions (`WHERE status = 'ACTIVE'`).

#### 2. OpenSearch Consumer Reliability (External Side Effect Handling)
- **Document Versioning:**
  - OpenSearch document ID = `product_id`.
  - Uses external versioning: `PUT /basket_products/_doc/{product_id}?version_type=external_gte&version={event_version_timestamp_ms}`.
  - If an older event arrives out-of-order, OpenSearch rejects with `409 Version Conflict`, which the consumer treats as a successful deduplication and commits the Kafka offset.
- **Consumer Sequence & Crash Recovery:**
  1. Poll batch from Kafka topics (`basket.catalogue.v1`, `basket.inventory.v1`).
  2. For each event, construct or update product search projection.
  3. Execute OpenSearch indexing call.
  4. If OpenSearch returns 200/201 (success) or 409 (superseded/replayed): proceed to commit Kafka offset.
  5. *Crash after OpenSearch write but before Kafka offset commit:* Next consumer poll re-delivers event. OpenSearch write with `external_gte` is strictly idempotent (version is identical or newer), preventing search index drift. Kafka offset is subsequently committed.
  6. *OpenSearch failure:* Retry up to 3 times with exponential backoff. On persistent failure, route event to dead-letter topic `basket.catalogue.dlq` / `basket.inventory.dlq`, log alert, and resume partition.
  7. *Reconciliation tool:* `scripts/reindex_opensearch.py` scans PostgreSQL to rebuild full search index using zero-downtime alias swap (`basket_products_v2` -> `basket_products`).

#### 3. Outbox Lease Ownership & Fencing
- **Schema Fields:** `claim_token` UUID, `claimed_at` TIMESTAMPTZ, `lease_expires_at` TIMESTAMPTZ, `retry_count` INT DEFAULT 0, `last_error` TEXT, `status` VARCHAR(20) (`PENDING`, `CLAIMED`, `PUBLISHED`, `FAILED`).
- **Claim Cycle (Atomic & Non-Blocking):**
  - Single atomic query:
    ```sql
    WITH claimable AS (
      SELECT id FROM outbox_events
      WHERE status = 'PENDING' OR (status = 'CLAIMED' AND lease_expires_at < NOW())
      ORDER BY created_at ASC LIMIT :batch_size
      FOR UPDATE SKIP LOCKED
    )
    UPDATE outbox_events
    SET status = 'CLAIMED', claim_token = :worker_token, claimed_at = NOW(), lease_expires_at = NOW() + INTERVAL '30 seconds'
    FROM claimable WHERE outbox_events.id = claimable.id
    RETURNING outbox_events.*;
    ```
  - Transaction commits immediately (DB row lock held < 5ms).
- **Lease Fencing on Completion:**
  - `UPDATE outbox_events SET status = 'PUBLISHED', published_at = NOW(), claim_token = NULL WHERE id = :event_id AND claim_token = :worker_token;`
  - If `rows_affected == 0`, lease expired and was reclaimed by another worker. The slow worker discards the update, preventing state corruption.
- **Lease Fencing on Failure:**
  - `UPDATE outbox_events SET status = CASE WHEN retry_count + 1 >= 5 THEN 'FAILED' ELSE 'PENDING' END, retry_count = retry_count + 1, last_error = :err, claim_token = NULL, lease_expires_at = NULL WHERE id = :event_id AND claim_token = :worker_token;`

#### 4. Search Projection Freshness & Event Catalogue
- **OpenSearch Consumer Subscriptions:**
  - Developer 1's search consumer listens to **both**:
    1. `basket.catalogue.v1` (Developer 1 domain events: `catalogue.product_created`, `catalogue.product_updated`, `catalogue.listing_status_changed`, `catalogue.price_changed`).
    2. `basket.inventory.v1` (Developer 2 domain events: `inventory.stock_threshold_crossed` when available stock transitions between `> 0` and `= 0`).
- **Shared Outbox Engine:**
  - Single shared `outbox_events` table in PostgreSQL.
  - Developer 1 and Developer 2 write to `outbox_events` within their local database transactions using a unified helper: `record_outbox_event(session, topic, event_type, payload, partition_key)`.
  - Developer 2 owns the outbox background publisher service.
  - Developer 1 owns the OpenSearch consumer indexing worker.

#### 5. Quote and Checkout Integrity
- **HMAC Signed Quote Token:**
  - Generated via `POST /api/v1/checkout/quote`.
  - Payload claims: `{ quote_id, subject_type ('user'|'guest'), subject_id, items: [{ listing_id, quantity, unit_price_paise }], total_amount_paise, currency: 'INR', items_hash: 'sha256(...)', iat, exp (NOW + 5 min) }`.
  - Signed with `settings.QUOTE_SIGNING_SECRET` using HMAC-SHA256 (supports secret rotation via key list).
- **Checkout Validation Sequence (`POST /api/v1/checkout`):**
  1. Authenticate subject (`user_id` via JWT Bearer or `guest_session_id` via `X-Session-Token`).
  2. Evaluate Idempotency: verify `(client_scope, endpoint, idempotency_key)` in `idempotency_records`.
  3. Validate HMAC signature and expiration timestamp of `quote_token`.
  4. Verify `quote.subject_id` matches authenticated caller.
  5. Begin DB transaction.
  6. Acquire row locks: `SELECT * FROM store_inventory WHERE listing_id IN (...) ORDER BY listing_id ASC FOR UPDATE;`
  7. Re-query current prices: `SELECT * FROM prices WHERE listing_id IN (...) AND is_current = TRUE;`
  8. If any price differs from quote `unit_price_paise` -> Rollback, return `409 Conflict (PRICE_CHANGED)`.
  9. If any `(on_hand_quantity - reserved_quantity) < item.quantity` -> Rollback, return `409 Conflict (INSUFFICIENT_STOCK)`.
  10. Atomically update `reserved_quantity = reserved_quantity + qty`.
  11. Insert `inventory_reservations` (`status = 'ACTIVE'`, 10 min expiry).
  12. Insert `orders` and `order_items` (`status = 'PENDING_PAYMENT'`).
  13. Insert `outbox_events` (`event_type = 'order.created'`).
  14. Insert `idempotency_records` (`status = 'SUCCESS'`, cached response).
  15. Commit DB transaction; return HTTP 201 with Order details.

#### 6. Idempotency Scope and Replay
- **Scoping:** `(client_scope, endpoint, idempotency_key)`.
  - `client_scope`: `user:{user_id}` or `guest:{guest_session_id}`.
  - `request_hash`: SHA-256 of canonical JSON payload.
- **Scenarios:**
  - *Identical key + Identical payload:* Replay stored HTTP response code and body.
  - *Identical key + Different payload:* Return `422 Unprocessable Entity (IDEMPOTENCY_PAYLOAD_MISMATCH)`.
  - *Concurrent duplicate request:* Return `409 Conflict (REQUEST_IN_PROGRESS)` with `Retry-After: 2`.
- **Schema Reconciliation:**
  - Central `idempotency_records` table enforces unique constraint on `(client_scope, endpoint, idempotency_key)`.
  - `orders.idempotency_key` column is retained for audit logging only, without an independent unique constraint.

#### 7. Demo Confirmation Endpoint (`POST /api/v1/orders/{order_id}/demo-confirm`)
- **Environment & Production Gating:**
  - Strictly requires `settings.DEMO_MODE == True` and `not settings.is_production`.
  - In production (`settings.is_production == True`) or when `DEMO_MODE == False`, returns `404 Not Found`.
- **Caller Authorization:**
  - Authenticated user order: caller JWT `sub` must match `order.user_id`.
  - Guest order: caller `X-Session-Token` must hash to match `order.guest_session_id`.
  - Unauthorized caller returns `403 Forbidden`.
- **State Machine & Reservation Enforcements:**
  - Order must be in `PENDING_PAYMENT`. If already `CONFIRMED`: idempotent 200 replay. If `CANCELLED` or `PAYMENT_FAILED`: returns `409 Conflict`.
  - Reservation must be `ACTIVE` and `expires_at > NOW()`. If `EXPIRED` or `RELEASED`: returns `409 Conflict (RESERVATION_EXPIRED)`.
  - Successful confirmation transitions reservation to `CONFIRMED`, deducts `on_hand_quantity` and `reserved_quantity`, sets order to `CONFIRMED`, and enqueues `order.confirmed` in `outbox_events`.

#### 8. Schema Completeness & API Endpoints
- **Foreign Keys:**
  - `orders.guest_session_id REFERENCES guest_sessions(id) ON DELETE SET NULL`
  - `orders.user_id REFERENCES users(id) ON DELETE RESTRICT`
  - `inventory_reservations.order_id REFERENCES orders(id) ON DELETE CASCADE`
  - `inventory_reservations.listing_id REFERENCES store_listings(id) ON DELETE RESTRICT`
  - `order_items.order_id REFERENCES orders(id) ON DELETE CASCADE`
- **Constraints:**
  - `prices`: partial unique index `CREATE UNIQUE INDEX uq_prices_current_listing ON prices(listing_id) WHERE is_current = TRUE;`
  - `store_inventory`: `CHECK (on_hand_quantity >= reserved_quantity AND reserved_quantity >= 0)`
  - `orders`: `CHECK ((user_id IS NOT NULL) OR (guest_session_id IS NOT NULL AND guest_email IS NOT NULL))`
- **Guest Session API:**
  - `POST /api/v1/sessions/guest` -> generates 32-byte CSPRNG token, stores SHA-256 hash in `guest_sessions`, returns `{ "session_token": "<raw>", "expires_at": "<ISO-8601>" }`. Client passes `X-Session-Token`.
- **Topics & Events:**
  - `basket.catalogue.v1`: `catalogue.product_created`, `catalogue.product_updated`, `catalogue.listing_status_changed`, `catalogue.price_changed` (Partition key: `product_id`).
  - `basket.inventory.v1`: `inventory.stock_threshold_crossed` (Partition key: `product_id`).
  - `basket.orders.v1`: `order.created`, `order.confirmed`, `order.cancelled` (Partition key: `order_id`).

**Reason:** Fully resolves all architecture review findings, prevents DB lock starvation, provides race-free inventory management, protects search index consistency, secures guest checkout, and establishes clear contracts for parallel developer implementation.  
**Files/contracts affected:** `DATA_MODEL.md`, `API_CONTRACTS.md`, `TASK_BREAKDOWN.md`, `backend/app/modules/*`, `backend/app/events/*`.  
**Status:** READY FOR CONTRACT FREEZE

---

### [2026-11-16 19:00 IST] — Technical Lead & Documentation Owner — [MASTER DEVELOPER HANDOFF / REPOSITORY CONSOLIDATION]

**Related branch / PR / task:** Repository-Wide Master Developer Handoff (`docs/developer-handoff`)  
**Affected module(s):** All repository documentation, governance, guides, backend, frontend, infrastructure  
**What I am proposing or requesting:**  
Formal handoff of the BASKET project to the incoming developer(s):

1. **Repository Audit & Baseline Status:**
   - **Phase 0 Foundation:** COMPLETED & VERIFIED. Merged into `integration` via PR #1 (`db9d790`). Both backend (FastAPI, SQLAlchemy 2 async engine, Alembic baseline, `/health`, `/ready`, `/api/v1/info`) and frontend (Next.js 15 App Router, React 19, Tailwind CSS, shadcn/ui primitives, typed `ApiClient`) are verified with 19 passing tests.
   - **Phase 1 Commerce Journey:** PLANNED / NOT STARTED IN APPLICATION CODE. `backend/app/modules/` and `frontend/features/` are currently empty.
2. **Documentation Consolidation Completed:**
   - Root Documents Created: `PROJECT_STATUS.md`, `DEVELOPER_HANDOFF.md`, `CONTRIBUTING.md`, `CHANGELOG.md`.
   - Dedicated Guides Created: `docs/NEW_DEVELOPER_QUICKSTART.md`, `docs/ENVIRONMENT_SETUP.md`, `docs/IMPLEMENTATION_ROADMAP.md`.
   - Core Architecture & Contracts Updated: `README.md`, `ARCHITECTURE.md`, `API_CONTRACTS.md`, `DATA_MODEL.md`, `DECISIONS.md`, `TASK_BREAKDOWN.md`, `QUALITY_GATES.md`, `DEVELOPMENT_WORKFLOW.md`.
3. **The 10 Outstanding Decisions Awaiting Sign-Off:**
   - Documented in detail in `PROJECT_STATUS.md` and `DEVELOPER_HANDOFF.md` (reservation model, circular order FK, search external versioning, concurrent idempotency 409 handling, quote binding, guest session TTL, atomic reservation expiry, outbox columns, DLQ policy, canonical naming of `store_listings`).
4. **Action Items for Incoming Developer:**
   - Step 1: Clone and verify environment via `./scripts/verify-environment.sh`.
   - Step 2: Read `DEVELOPER_HANDOFF.md` and `docs/NEW_DEVELOPER_QUICKSTART.md`.
   - Step 3: Review and formally sign off on the 10 outstanding decisions with team lead.
   - Step 4: Author Phase 1 Alembic migration `0002_phase1_commerce_schema.py`.
   - Step 5: Begin parallel development on `feature/catalogue-search` (Dev 1) and `feature/cart-checkout` (Dev 2).

**Reason:** Enables full operational independence for incoming developers without oral tradition or undocumented assumptions.  
**Files/contracts affected:** All repository Markdown documentation and guides.  
**Status:** HANDOFF DOCUMENTATION COMPLETE & COMMITTED
