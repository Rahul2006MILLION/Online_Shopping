# BASKET — Architecture Decision Record (ADR) Log

This log records material architectural decisions, their business context, alternatives considered, and trade-offs.

---

## Accepted Decisions (Phase 0 Foundation Baseline)

### ADR-001 — Modular Monolith Backend
- **Status:** `ACCEPTED`
- **Date:** 2026-11-16
- **Context:** Two developers and a hackathon timeline do not justify the deployment overhead, distributed network failures, and latency of microservices.
- **Decision:** Use a FastAPI modular monolith with explicit domain boundaries and separately runnable background Kafka workers.
- **Consequences:** Simple single-repo deployment; domain boundaries must be preserved through directory structures and schema discipline.

### ADR-002 — PostgreSQL as System of Record
- **Status:** `ACCEPTED`
- **Date:** 2026-11-16
- **Context:** Multi-category retail pricing, stock, reservations, and orders require transactional ACID authority.
- **Decision:** Aiven PostgreSQL is the sole authority for commerce state.
- **Consequences:** Frontend state and OpenSearch search documents are treated as untrusted/eventually consistent and re-validated at checkout.

### ADR-003 — OpenSearch as Derived Search Projection
- **Status:** `ACCEPTED`
- **Date:** 2026-11-16
- **Context:** Fast faceted search and text matching across multi-category products require OpenSearch, but OpenSearch must not introduce financial inaccuracies.
- **Decision:** OpenSearch is an eventually consistent read-only projection populated asynchronously from domain events. Checkout queries PostgreSQL only.
- **Consequences:** Search results may lag by seconds during heavy write traffic; checkout is completely protected against stale search data.

### ADR-004 — Transactional Outbox for Kafka Publication
- **Status:** `ACCEPTED`
- **Date:** 2026-11-16
- **Context:** Publishing directly to Kafka inside a database transaction causes connection pool exhaustion, and publishing after commit causes dual-write message loss if the process crashes.
- **Decision:** Commit domain event intent to an `outbox_events` table in PostgreSQL in the same transaction as business data. Publish asynchronously via a background daemon.
- **Consequences:** Requires idempotent consumers and lease-fenced publishing.

### ADR-005 — Server-Enforced Atomic Multi-Item Reservations (Parent-Child Model)
- **Status:** `ACCEPTED (MODEL STANDARDIZED IN PROPOSAL)`
- **Date:** 2026-11-16
- **Context:** High-concurrency flash sales ("Sale Storm") can result in overselling if stock checks occur only in the UI or without row locks. A flat reservation table loses multi-item order coherence.
- **Decision:** Acquire sorted row-level locks (`ORDER BY listing_id ASC FOR UPDATE`) during checkout; enforce `CHECK (on_hand_quantity >= reserved_quantity)` in PostgreSQL; standardize the proposed schema on parent `inventory_reservations` with child `reservation_items` records; reserve all items atomically with 10-minute expiry.
- **Consequences:** Eliminates deadlocks and overselling; requires an automated background expiry release daemon.

### ADR-006 — AI as Advisory, Backend as Authoritative
- **Status:** `ACCEPTED`
- **Date:** 2026-11-16
- **Context:** LLM outputs can hallucinate or be manipulated through prompt injection.
- **Decision:** AI features (Quinn negotiation, voice shopping) may suggest or explain, but backend services enforce all authorization, prices, discounts, and inventory mutations.
- **Consequences:** AI tools must be narrow, strongly typed, and execute through server-validated service APIs.

### ADR-007 — Lease-Based Outbox Publishing (Zero DB Locks During Network I/O)
- **Status:** `ACCEPTED IN PRINCIPLE`
- **Date:** 2026-11-16
- **Context:** Holding database locks while awaiting Kafka network acknowledgements starves PostgreSQL connections.
- **Decision:** Outbox worker claims a batch in a sub-5ms transaction using `FOR UPDATE SKIP LOCKED`, setting `claim_token = UUID` and `lease_expires_at = NOW() + 30s`. Publishes to Kafka with zero DB locks held. Marks `PUBLISHED` in a separate short transaction fenced with `WHERE claim_token = :token`.
- **Consequences:** High publisher throughput; worker crash recovery is safe via lease expiry.

---

## Proposed Decisions Under Review (Phase 1 Commerce)

### ADR-008 — OpenSearch Projection Versioning via Monotonic Per-Product Version
- **Status:** `PROPOSED / PENDING DESIGN REVISION`
- **Date:** 2026-11-16
- **Context:** Asynchronous indexing consumers can receive events out of order or replay duplicate events upon crash recovery. Earlier proposals used millisecond event timestamps (`occurred_at_ms`), but distributed clock drift across nodes makes timestamps unreliable for strict monotonicity.
- **Decision:** Replace timestamp-based versioning with a **monotonic per-product projection version** (`products.projection_version INT` incremented monotonically in PostgreSQL on product/listing/price/threshold mutations) passed in domain event envelopes and evaluated in OpenSearch via `version_type=external_gte`.
- **Consequences:** Guarantees strict monotonic order without clock drift; requires version increment trigger or service logic in PostgreSQL.

### ADR-009 — HMAC-Signed Checkout Quote Tokens
- **Status:** `PROPOSED (QUOTE-TO-CART BINDING UNRESOLVED)`
- **Date:** 2026-11-16
- **Context:** Displaying a binding quote to a user requires price stability for a short window without premature inventory locking.
- **Decision:** `POST /checkout/quote` issues a 5-minute signed HMAC token containing items and amounts. `POST /checkout` verifies signature, then re-verifies price and stock in PostgreSQL under row locks.
- **Unresolved Decision:** Whether the quote token binds strictly to an immutable item array or to an explicit `(cart_id, cart_version)`.

### ADR-010 — Cryptographically Secure Bearer Tokens for Guest Shoppers
- **Status:** `PROPOSED (RETENTION & LINKING UNRESOLVED)`
- **Date:** 2026-11-16
- **Context:** Customers must be able to browse, assemble carts, and checkout without mandatory upfront account creation.
- **Decision:** `POST /sessions/guest` issues a 32-byte CSPRNG token (`X-Session-Token`). The server stores only `token_hash = sha256(token)` in `guest_sessions`.
- **Unresolved Decision:** Formal retention policy (TTL) for guest sessions and the exact account linking workflow for guest orders upon subsequent customer registration.

### ADR-011 — Centralized Scoped Idempotency Records
- **Status:** `PROPOSED (CONCURRENCY CLAIM UNRESOLVED)`
- **Date:** 2026-11-16
- **Context:** Network timeouts cause clients to retry requests, risking duplicate order creation.
- **Decision:** Dedicated table `idempotency_records` keyed on `key_hash = sha256(client_scope + ":" + endpoint + ":" + idempotency_key)`.
- **Unresolved Decision:** Exact concurrency claim mechanism (catching database unique constraint violation vs row-level locking) when concurrent requests arrive with the same key.

---

## Summary of Outstanding Decisions (Awaiting Phase 1 Sign-Off)

1. [ ] **Reservation Model:** Standardize on parent `inventory_reservations` + child `reservation_items`. (Flat model rejected).
2. [ ] **Circular FK Insertion Order:** Insert `orders` first, then `inventory_reservations`, then `reservation_items`.
3. [ ] **OpenSearch Versioning:** Finalize monotonic per-product versioning design (`products.projection_version`), rejecting timestamp versioning.
4. [ ] **Concurrent Idempotency:** Agree on unique constraint collision handling vs row locking.
5. [ ] **Quote-to-Cart Binding:** Formally decide between immutable item array vs `(cart_id, cart_version)` binding.
6. [ ] **Guest Session Retention:** Define TTL policy and historical order linking workflow.
7. [ ] **Expiry Coordination:** Define atomic coordination for releasing expired stock and cancelling orders.
8. [ ] **Outbox Table Columns:** Approve inclusion of `topic` and `partition_key` in `outbox_events`.
9. [ ] **DLQ Policy:** Agree on consumer offset commit upon DLQ dispatch and replay tooling.
10. [ ] **Listing Naming:** Formally approve `store_listings` across all code, tables, and documentation.
