# BASKET — Architecture Decision Record (ADR) Log

This log records material architectural decisions, their business context, alternatives considered, and trade-offs.

---

## Accepted Decisions

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

### ADR-005 — Server-Enforced Atomic Multi-Item Inventory Reservations
- **Status:** `ACCEPTED`
- **Date:** 2026-11-16
- **Context:** High-concurrency flash sales ("Sale Storm") can result in overselling if stock checks occur only in the UI or without row locks.
- **Decision:** Acquire sorted row-level locks (`ORDER BY listing_id ASC FOR UPDATE`) during checkout; enforce `CHECK (on_hand_quantity >= reserved_quantity)` in PostgreSQL; reserve all items atomically with 10-minute expiry.
- **Consequences:** Eliminates deadlocks and overselling; requires an automated background expiry release daemon.

### ADR-006 — AI as Advisory, Backend as Authoritative
- **Status:** `ACCEPTED`
- **Date:** 2026-11-16
- **Context:** LLM outputs can hallucinate or be manipulated through prompt injection.
- **Decision:** AI features (Quinn negotiation, voice shopping) may suggest or explain, but backend services enforce all authorization, prices, discounts, and inventory mutations.
- **Consequences:** AI tools must be narrow, strongly typed, and execute through server-validated service APIs.

### ADR-007 — Lease-Based Outbox Publishing (Zero DB Locks During Network I/O)
- **Status:** `ACCEPTED`
- **Date:** 2026-11-16
- **Context:** Holding database locks while awaiting Kafka network acknowledgements starves PostgreSQL connections.
- **Decision:** Outbox worker claims a batch in a sub-5ms transaction using `FOR UPDATE SKIP LOCKED`, setting `claim_token = UUID` and `lease_expires_at = NOW() + 30s`. Publishes to Kafka with zero DB locks held. Marks `PUBLISHED` in a separate short transaction fenced with `WHERE claim_token = :token`.
- **Consequences:** High publisher throughput; worker crash recovery is safe via lease expiry.

### ADR-008 — OpenSearch External Versioning (`version_type=external_gte`)
- **Status:** `ACCEPTED`
- **Date:** 2026-11-16
- **Context:** Asynchronous indexing consumers can receive events out of order or duplicate events upon consumer crash recovery.
- **Decision:** OpenSearch documents use deterministic `_id = product_id` and `version_type=external_gte` keyed on monotonic millisecond timestamps (`occurred_at_ms`).
- **Consequences:** Older events arriving out of order are rejected idempotently by OpenSearch (409 Conflict), preventing search index drift.

### ADR-009 — HMAC-Signed Checkout Quote Tokens
- **Status:** `ACCEPTED`
- **Date:** 2026-11-16
- **Context:** Displaying a binding quote to a user requires price stability for a short window without premature inventory locking.
- **Decision:** `POST /checkout/quote` issues a 5-minute signed HMAC token containing items and amounts. `POST /checkout` verifies the signature, then re-verifies price and stock in PostgreSQL under row locks.
- **Consequences:** Rejects stale quotes with HTTP 409 (`PRICE_CHANGED`) if prices were updated in the database during the window.

### ADR-010 — Cryptographically Secure Bearer Tokens for Guest Shoppers
- **Status:** `ACCEPTED`
- **Date:** 2026-11-16
- **Context:** Customers must be able to browse, assemble carts, and checkout without mandatory upfront account creation.
- **Decision:** `POST /sessions/guest` issues a 32-byte CSPRNG token (`X-Session-Token`). The server stores only `token_hash = sha256(token)` in `guest_sessions`.
- **Consequences:** Prevents guest token enumeration; orders reference `guest_session_id` and require `guest_email`.

### ADR-011 — Centralized Scoped Idempotency Records
- **Status:** `ACCEPTED`
- **Date:** 2026-11-16
- **Context:** Network timeouts cause clients to retry requests, risking duplicate order creation.
- **Decision:** Dedicated table `idempotency_records` keyed on `key_hash = sha256(client_scope + ":" + endpoint + ":" + idempotency_key)`. Concurrent requests return 409 (`REQUEST_IN_PROGRESS`). Replays return cached responses.
- **Consequences:** Eliminates duplicate orders without polluting business domain tables.

---

## Pending Decisions (Awaiting Phase 1 Sign-Off)

1. [ ] Formally approve the 10 outstanding schema and concurrency decisions listed in `PROJECT_STATUS.md`.
2. [ ] Assign named developer handles for Developer 1, Developer 2, and Integration Owner.
3. [ ] Provide live Aiven credentials and Kafka TLS certificates.
4. [ ] Select the 1 or 2 differentiators to implement post-P0 (e.g. Sale Storm proof, Quinn negotiation).
