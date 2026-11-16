# BASKET — Quality Gates & Definition of Done

> Quality and correctness take strict precedence over feature volume. A feature is not complete because an endpoint returns HTTP 200 or a page renders mock data.

---

## 1. Automated Verification Sequence

Every developer must run the automated verification sequence prior to opening a pull request:

```bash
# Automated verification gate across both backend and frontend
./scripts/verify-environment.sh
```

### Component-Level Commands (Verified in Repository)

| Subsystem | Gate Check | Actual Repository Command | Passing Criterion |
|---|---|---|---|
| **Backend** | Linter | `cd backend && ruff check .` | 0 errors, 0 warnings |
| **Backend** | Formatter | `cd backend && ruff format --check .` | 0 formatting discrepancies |
| **Backend** | Unit & Route Tests | `cd backend && pytest -v` | 12/12 tests pass |
| **Backend** | Migration Discovery | `cd backend && alembic heads` | Single linear head |
| **Frontend** | Type Safety | `cd frontend && npm run type-check` | TypeScript exit 0 (`tsc --noEmit`) |
| **Frontend** | Linter | `cd frontend && npm run lint` | 0 ESLint errors |
| **Frontend** | Unit Tests | `cd frontend && npm test` | 7/7 tests pass |
| **Frontend** | Production Build | `cd frontend && npm run build` | Next.js compilation exit 0 |

---

## 2. Gate Definitions

### Gate 1: Foundation Baseline (`PASSED`)
- [x] Repository clones and builds cleanly without undocumented steps.
- [x] Both backend and frontend run independently.
- [x] Readiness endpoint (`/ready`) validates database connectivity and responds with HTTP 503 on failure.
- [x] Centralized API client handles structured error envelopes and all REST verbs.
- [x] All 19 automated foundation tests pass.

### Gate 2: Feature & Module Gate (Per Feature PR)
Every feature branch PR must satisfy:
- [ ] Explicit business outcome mapped to `TASK_BREAKDOWN.md`.
- [ ] Conforms to schemas in `API_CONTRACTS.md` and `DATA_MODEL.md`.
- [ ] Server-side input validation via Pydantic v2.
- [ ] Automated tests covering both happy path and edge-case failure paths.
- [ ] Frontend loading, empty, success, and error states handled gracefully.
- [ ] Zero dead buttons, placeholder routes, or fake success messages.
- [ ] Structured logging without exposing passwords, tokens, or PII.

### Gate 3: Commerce & Concurrency Gate
- [ ] Client prices and stock are strictly untrusted; re-verified in PostgreSQL.
- [ ] Multi-item inventory reservations are all-or-nothing.
- [ ] Row locks are acquired in sorted order (`ORDER BY listing_id ASC FOR UPDATE`) to prevent deadlocks.
- [ ] Concurrent checkouts cannot violate `CHECK (on_hand_quantity >= reserved_quantity)`.
- [ ] State-mutating endpoints enforce `Idempotency-Key` headers.
- [ ] Expired reservations (10 min) are released cleanly by background daemon.

### Gate 4: Infrastructure & Eventing Gate
- [ ] Outbox events are committed in the same database transaction as business mutations.
- [ ] Outbox publisher uses lease fencing; zero DB locks held during Kafka network I/O.
- [ ] OpenSearch indexing consumer uses `version_type=external_gte` to reject out-of-order events.
- [ ] Replay of duplicate events does not duplicate side effects.
- [ ] Live Aiven PostgreSQL, Kafka, and OpenSearch connectivity verified with actual telemetry.

---

## 3. Release Rule

A P0 failure blocks release. No optional feature (e.g. Quinn negotiation, voice shopping) may be demonstrated or merged if the core commerce journey (browse → search → cart → checkout → order confirmation) has failing quality gates.
