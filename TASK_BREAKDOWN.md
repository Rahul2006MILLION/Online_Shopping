# BASKET — Engineering Task Breakdown & Role Ownership

> **Milestone Status:** Phase 0 Completed (`db9d790`); Phase 1 Pre-Implementation Architecture Review.

---

## 1. Team Role Assignments

| Responsibility | Proposed Role | Assigned Developer / Handle | Status |
|---|---|---|---|
| **Integration Owner** | Core Shared Contracts, Migrations & Release | `To be assigned` | Unassigned |
| **Developer 1** | Product Discovery & Search (Frontend & Backend) | `To be assigned` | Unassigned |
| **Developer 2** | Cart, Inventory, Orders & Outbox (Frontend & Backend) | `To be assigned` | Unassigned |
| **Aiven Cloud Admin** | Infrastructure credentials, SSL certs & topics | `To be assigned` | Unassigned |

---

## 2. Phase 0 — Foundation Baseline [VERIFIED IMPLEMENTATION]

- [x] Create repository structure, `.gitignore`, and Git branch baseline (`integration`).
- [x] Author foundational governance and architecture documents.
- [x] Configure backend settings, Pydantic schemas, and structured logging.
- [x] Implement SQLAlchemy 2.0 async engine supporting Aiven PostgreSQL SSL and SQLite testing.
- [x] Initialize Alembic harness and verify baseline migration discovery (`0001_initial_baseline.py`).
- [x] Implement `/health` (liveness), `/ready` (dependency check), and `/api/v1/info` endpoints.
- [x] Initialize Next.js 15 App Router frontend with React 19, Tailwind CSS, and shadcn/ui.
- [x] Implement centralized typed `ApiClient` with GET, POST, PATCH, DELETE and unit tests.
- [x] Create automated bootstrap (`scripts/dev-setup.sh`) and verification (`scripts/verify-environment.sh`) scripts.
- [x] Pass all foundation quality gates, execute Phase 0.1–0.4 audit, and merge via PR #1 (`db9d790`).

---

## 3. Phase 1 — Commerce Core Journey [PROPOSED ARCHITECTURE — UNDER REVIEW]

### Pre-Requisite Gate (Integration Owner & Team)
- [ ] Formally review and resolve the 10 outstanding decisions in `PROJECT_STATUS.md`.
- [ ] Freeze `API_CONTRACTS.md` and `DATA_MODEL.md` (contract freeze).
- [ ] **Author Alembic migration `0002_phase1_commerce_schema.py` ONLY AFTER formal contract freeze.**
- [ ] Apply migration and verify on clean PostgreSQL and SQLite databases.
- [ ] Add `aiokafka>=0.11.0` and `opensearch-py>=2.8.0` to `backend/requirements.txt`.

### Developer 1: Product Discovery & Search
- **Backend:**
  - [ ] Implement `backend/app/modules/catalogue/models.py`, `schemas.py`, `services.py`.
  - [ ] Implement `GET /api/v1/categories` category tree hierarchy.
  - [ ] Implement `GET /api/v1/products` and `GET /api/v1/products/{id}`.
  - [ ] Implement `backend/app/modules/search/` with OpenSearch query DSL.
  - [ ] Implement `GET /api/v1/search` with keyword query, category filter, and price facets.
  - [ ] Implement OpenSearch consumer worker subscribing to `basket.catalogue.v1` and `basket.inventory.v1` using monotonic per-product projection versions.
- **Frontend:**
  - [ ] Implement `frontend/features/catalogue/` (product cards, variant selector, category navigation).
  - [ ] Implement `frontend/features/search/` (search bar, filter sidebar, pagination).
  - [ ] Implement product details page (`frontend/app/products/[id]/page.tsx`).

### Developer 2: Cart, Inventory & Orders
- **Backend:**
  - [ ] Implement `backend/app/modules/cart/` (session-backed and user-backed carts).
  - [ ] Implement `GET /api/v1/cart`, `POST /api/v1/cart/items`, `PATCH /api/v1/cart/items/{id}`, `DELETE /api/v1/cart/items/{id}`.
  - [ ] Implement `POST /api/v1/checkout/quote` with HMAC token signing and 5-minute TTL.
  - [ ] Implement `backend/app/modules/inventory/` with atomic sorted row-locking (`ORDER BY listing_id ASC FOR UPDATE`) and parent-child reservation model (`inventory_reservations` + `reservation_items`).
  - [ ] Implement `POST /api/v1/checkout` creating order and atomic reservation under idempotency key.
  - [ ] Implement `POST /api/v1/orders/{id}/demo-confirm` (development mode only).
  - [ ] Implement `backend/app/events/outbox/` background publisher daemon.
  - [ ] Implement reservation expiry daemon releasing stock after 10 minutes.
- **Frontend:**
  - [ ] Implement `frontend/features/cart/` (slide-out cart drawer, item count badge).
  - [ ] Implement `frontend/features/checkout/` (address form, quote review, place order button).
  - [ ] Implement order confirmation page (`frontend/app/orders/[id]/page.tsx`).

---

## 4. Phase 2 — System Integration & End-to-End Proof [PLANNED]

- [ ] Connect Frontend catalogue & search to cart drawer.
- [ ] Wire checkout page to `/api/v1/checkout/quote` and `/api/v1/checkout`.
- [ ] Verify `order.created` event published to Kafka broker.
- [ ] Verify OpenSearch index automatically updates when stock reaches 0.
- [ ] Execute complete customer journey: browse -> search -> cart -> checkout -> order confirmation.

---

## 5. Phase 3 — Sale Storm & Reliability Demonstration [FUTURE ACCEPTANCE TESTS — NOT YET EXECUTED]

- [ ] Write Sale Storm concurrency test (`scripts/test-sale-storm.sh`).
- [ ] Run 50 concurrent checkouts against 5 available units; verify 5 succeed, 45 fail with 409, 0 oversold.
- [ ] Demonstrate outbox worker lease fencing and crash recovery.
- [ ] Connect to live Aiven PostgreSQL, Kafka, and OpenSearch; verify telemetry in Aiven Console.
- [ ] Rehearse live demonstration and record backup demonstration video.
