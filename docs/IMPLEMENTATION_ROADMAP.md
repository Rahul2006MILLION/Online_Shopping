# BASKET — Comprehensive Implementation Roadmap

This document outlines the phased engineering roadmap for the BASKET online shopping platform, tracking the journey from foundation setup to hackathon release.

---

## 1. Project Phases & Status Matrix

| Phase | Title | Scope Summary | Status | Key Deliverable / Gate |
|---|---|---|---|---|
| **Phase 0** | Foundation Baseline | Monorepo setup, Next.js 15 shell, FastAPI shell, DB lifecycle, API client, verification scripts | **`COMPLETED`** | PR #1 merged into `integration`; all quality gates passing |
| **Phase A** | Architecture & Work Allocation | Module boundaries, event catalogue, outbox pattern, reservation lifecycle, developer ownership | **`IN REVIEW`** | `AGENT_HANDOFF.md` entries; 10 open schema/concurrency decisions |
| **Phase B** | Contract Freeze & DB Foundation | Resolve schema conflicts, freeze `API_CONTRACTS.md` & `DATA_MODEL.md`, author `0002_phase1_commerce_schema.py` | **`PENDING SIGN-OFF`** | Clean Alembic migration upgrade/downgrade; shared types frozen |
| **Phase C** | Parallel Feature Development | Dev 1: Catalogue & Search; Dev 2: Cart, Inventory & Orders | **`NOT STARTED`** | Isolated feature branches; unit and module tests |
| **Phase D** | System Integration | Connect Discovery to Cart; Checkout to Inventory; Outbox to Kafka; OpenSearch consumer | **`NOT STARTED`** | End-to-end browse → search → cart → checkout → order flow |
| **Phase E** | Reliability & Demo Hardening | Sale Storm concurrency proof, outbox crash recovery, Aiven live proof, demo rehearse | **`NOT STARTED`** | Video recording, zero oversell proof, live service verification |

---

## 2. Detailed Phase Breakdown

### Phase 0 — Foundation Baseline [VERIFIED IMPLEMENTATION]
- [x] Initialized Next.js 15 frontend with React 19, Tailwind CSS, and shadcn/ui.
- [x] Initialized FastAPI modular monolith with lifespan, structured logging, and error envelopes.
- [x] Implemented SQLAlchemy 2.0 async engine with PostgreSQL Aiven SSL and SQLite test support.
- [x] Created centralized typed `ApiClient` with GET, POST, PATCH, DELETE and unit tests.
- [x] Implemented `/health` (liveness), `/ready` (dependency check), and `/api/v1/info`.
- [x] Created `dev-setup.sh` and `verify-environment.sh` CI/CD quality gate scripts.
- [x] Audited, remediated, and merged into `integration` via PR #1 (`db9d790`).

### Phase A — Architecture & Planning [PROPOSED ARCHITECTURE — IN REVIEW]
- [x] Established two-developer ownership model (Developer 1: Search/Discovery; Developer 2: Cart/Inventory/Orders).
- [x] Designed lease-based Transactional Outbox pattern eliminating DB locks during Kafka I/O.
- [x] Designed atomic inventory reservation lifecycle using parent-child model (`inventory_reservations` + `reservation_items`).
- [x] Proposed OpenSearch indexing consumer design with monotonic per-product projection versions.
- [x] Proposed HMAC-signed checkout quote tokens with PostgreSQL server re-verification.
- [ ] **Pending Action:** Formally sign off on the 10 outstanding schema and concurrency decisions documented in [PROJECT_STATUS.md](../PROJECT_STATUS.md).

### Phase B — Contract Freeze & Database Foundation [PENDING CONTRACT FREEZE]
1. Reconcile reservation model: standardize on parent `inventory_reservations` with child `reservation_items` table.
2. Replace timestamp versioning with monotonic per-product projection version design (`products.projection_version`).
3. Resolve quote-to-cart binding, idempotency concurrency, guest session retention, and expiry coordination.
4. Standardize listing entity naming on `store_listings`.
5. Freeze JSON schemas for all `/api/v1` routes in `API_CONTRACTS.md`.
6. Freeze event schemas in `backend/app/events/schemas/`.
7. **Author Alembic migration `0002_phase1_commerce_schema.py` ONLY AFTER formal contract freeze.**
8. Verify migration locally on clean PostgreSQL and SQLite databases.

### Phase C — Parallel Feature Development [NOT STARTED]

#### Developer 1 — Product Discovery & Search
- **Backend (`backend/app/modules/catalogue/`, `backend/app/modules/search/`):**
  - Category tree hierarchy endpoint `GET /api/v1/categories`.
  - Product browse and detail endpoints `GET /api/v1/products`, `GET /api/v1/products/{id}`.
  - OpenSearch search endpoint `GET /api/v1/search` supporting text search, category filters, and price facets.
  - OpenSearch indexing consumer service subscribing to `basket.catalogue.v1` and `basket.inventory.v1`.
- **Frontend (`frontend/features/catalogue/`, `frontend/features/search/`):**
  - Homepage category browse cards and featured product carousel.
  - Search results page with faceted filtering (category, price range, in-stock toggle).
  - Product detail page with variant selector and real-time availability indicator.

#### Developer 2 — Cart, Inventory & Orders
- **Backend (`backend/app/modules/cart/`, `backend/app/modules/inventory/`, `backend/app/modules/orders/`):**
  - Cart management endpoints `GET /api/v1/cart`, `POST /api/v1/cart/items`, `PATCH /api/v1/cart/items/{id}`, `DELETE /api/v1/cart/items/{id}`.
  - Quote calculation endpoint `POST /api/v1/checkout/quote` generating HMAC-signed quote token.
  - Checkout endpoint `POST /api/v1/checkout` with sorted row-locking (`ORDER BY listing_id ASC FOR UPDATE`), all-or-nothing multi-item reservation, order creation, and outbox insertion.
  - Transactional Outbox publisher daemon polling `outbox_events` and producing to Aiven Kafka.
  - Reservation expiry background worker releasing unconfirmed stock after 10 minutes.
- **Frontend (`frontend/features/cart/`, `frontend/features/checkout/`):**
  - Slide-over cart drawer with quantity adjustment and subtotal calculation.
  - Checkout page with delivery address form, quote summary, and place order button.
  - Order confirmation screen displaying order status and reservation timer.

### Phase D — System Integration [NOT STARTED]
- Connect Frontend Catalogue & Search to Add-to-Cart drawer.
- Connect Cart to Quote generation and Checkout placement.
- Verify outbox publisher writes `order.created` events to Aiven Kafka.
- Verify search consumer updates OpenSearch `basket_products` index when catalogue or inventory stock changes.
- Perform end-to-end customer journey from search to confirmed order.

### Phase E — Reliability Proof & Demonstration [FUTURE ACCEPTANCE TESTS — NOT YET EXECUTED]
- **Sale Storm Proof:** Concurrency test script launching 50 parallel checkouts against 5 available units; assert zero overselling.
- **Crash Recovery Proof:** Simulate outbox worker failure during network I/O; assert lease expiry and safe recovery.
- **Duplicate Event Proof:** Re-feed duplicate Kafka message; assert OpenSearch deduplication and zero duplicate side effects.
- **Aiven Cloud Proof:** Connect to live Aiven PostgreSQL, Kafka, and OpenSearch; verify telemetry in Aiven Console.
- Rehearse live demonstration; record backup video.

---

## 3. Feature Portfolio: Core vs Differentiators

### Core Commerce Journey (Mandatory P0)
1. **Product Discovery:** Hierarchical category navigation and product details.
2. **OpenSearch Powered Search:** Fast text search with faceted filtering.
3. **Cart Management:** Server-persisted cart for authenticated and guest users.
4. **Server-Authoritative Pricing & Stock:** In-flight checkout re-verification.
5. **Atomic Inventory Reservation:** Lock stock safely to prevent flash sale oversell using parent-child model.
6. **Order Placement:** Order state machine with durable order items snapshot.
7. **Event-Driven Architecture:** Transactional outbox to Aiven Kafka to OpenSearch.

### Differentiator Portfolio (P1 / P2 — Strictly Post-P0)
The following candidate differentiators have been architected and may be selectively implemented only after the core commerce journey passes all quality gates:

| Differentiator | Classification | Concept Summary | Planned Status |
|---|---|---|---|
| **Sale Storm** | P1 | High-concurrency flash sale validation demonstrating zero overselling under race conditions. | `PLANNED` |
| **Quinn** | P1 | Bounded retail negotiation assistant that offers time-limited price quotes within server-enforced discount floors. | `PLANNED` |
| **Apni Bhasha** | P1 | Multilingual voice/text search for vernacular Indian languages (Hindi, Tamil, Kannada). | `PLANNED` |
| **Basket Suggests** | P1 | Like-for-like comparison for exact identical product variants across competing sellers/stores. | `PLANNED` |
| **Demand Gap Radar** | P1 | Real-time analytics dashboard aggregating zero-result searches by pin code and category to highlight retail demand gaps. | `PLANNED` |
| **Basket Mission** | P2 | Goal-driven multi-category shopping plan with one-click cart assembly. | `PLANNED` |
| **Demand Exchange** | P2 | Reverse commerce marketplace where customers post "Demand Boxes" and verified local retailers submit bids. | `PLANNED` |
| **Product Proof** | P2 | Trust and provenance passport showing verified supply chain evidence (FSSAI licenses, organic certifications). | `PLANNED` |
| **BASKET LIVE** | P2 | Voice-first shopping interface integrated through a streaming speech provider adapter. | `PLANNED` |
| **Basket Intent Memory** | P2 | Contextual memory that remembers user dietary preferences and repeat purchasing schedules. | `PLANNED` |
| **Substitute Intelligence**| P2 | Intelligent out-of-stock replacement recommendations matching volume, brand tier, and constraints. | `PLANNED` |
| **Deals for You** | P2 | Personalized basket-level bundles and discount recommendations. | `PLANNED` |
| **Buy It Again** | P2 | 1-click repeat order assembling consumables based on historical purchase velocity. | `PLANNED` |
