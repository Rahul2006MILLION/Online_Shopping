# BASKET — Engineering Contribution Guidelines

Welcome to the BASKET engineering team. To maintain our codebase quality, reliability, and speed during two-developer parallel development, all contributors must adhere to these guidelines.

---

## 1. Branch Naming Conventions

All branches must follow these conventions:

- `feature/<module-name>-<short-description>` (e.g. `feature/catalogue-api`, `feature/cart-checkout`)
- `fix/<module-name>-<short-description>` (e.g. `fix/inventory-row-locking`, `fix/readiness-status-code`)
- `docs/<short-description>` (e.g. `docs/developer-handoff`, `docs/api-contracts`)
- `test/<module-name>-<short-description>` (e.g. `test/concurrency-checkout`)
- `refactor/<module-name>-<short-description>`

**Protected Branches:**
- `main`: Production and demo-ready baseline. Direct commits and pushes are strictly prohibited.
- `integration`: Shared active development trunk. All pull requests target `integration`. Direct pushes are reserved exclusively for the designated Integration Owner.

---

## 2. Git Workflow & Pull Requests

### Starting a Task
1. Fetch latest changes:
   ```bash
   git fetch origin
   git checkout integration
   git pull --ff-only origin integration
   ```
2. Create your isolated feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Announce your task and owned files in `AGENT_HANDOFF.md`.

### Committing Changes
We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
- `feat(<scope>): <description>` — New application functionality.
- `fix(<scope>): <description>` — Bug fix.
- `docs(<scope>): <description>` — Documentation only.
- `test(<scope>): <description>` — Adding or refactoring tests.
- `refactor(<scope>): <description>` — Code change that neither fixes a bug nor adds a feature.
- `chore(<scope>): <description>` — Build process, dependency updates, or tool configurations.

Keep commits small, logical, and focused. Never bundle formatting churn with functional changes.

### Submitting a Pull Request
1. Run the full verification suite locally:
   ```bash
   ./scripts/verify-environment.sh
   ```
2. Push your branch to GitHub:
   ```bash
   git push -u origin feature/your-feature-name
   ```
3. Open a Pull Request targeting `integration`.
4. Include in the PR description:
   - Summary of changes and business motivation.
   - List of modified modules and database tables.
   - Evidence of passing tests (output logs or screenshots).
   - Known limitations or follow-up tasks.
5. Obtain approval from the other developer or Integration Owner before merging.
6. Merge using a standard **merge commit** (do not squash or rebase without coordination).

---

## 3. Code Formatting, Linting & Type Safety

### Backend (Python 3.12)
- **Linter & Formatter:** [Ruff](https://docs.astral.sh/ruff/)
- Commands:
  ```bash
  cd backend
  source .venv/bin/activate
  ruff check --fix .
  ruff format .
  ```
- **Type Annotations:** All service functions, route handlers, and data models must include explicit type annotations. Use Python 3.12 syntax (`int | None`, `list[str]`, etc.).
- **Validation:** Use Pydantic v2 schemas for all HTTP request and response boundaries.

### Frontend (Next.js 15 & TypeScript)
- **Type Checking:** Strict mode enabled.
  ```bash
  cd frontend
  npm run type-check
  ```
- **Linting:** ESLint with Next.js core web vitals configuration:
  ```bash
  cd frontend
  npm run lint
  ```
- **No `any` Policy:** Avoid `any` types; define explicit interfaces in `frontend/types/` or domain feature directories.

---

## 4. Testing Standards

A feature is not complete without automated tests covering both happy and failure paths.

1. **Backend Tests (pytest):**
   ```bash
   cd backend
   pytest -v
   ```
   - Unit tests for services and helpers.
   - HTTP integration tests for route handlers using `httpx.AsyncClient` or `starlette.testclient.TestClient`.
   - Concurrency tests for transactional inventory reservations.
2. **Frontend Tests (Node test runner):**
   ```bash
   cd frontend
   npm test
   ```
   - Component rendering and state tests.
   - API client network mock tests.

---

## 5. Database Migration Rules

- **Designated Ownership:** Only one developer acts as the Database/Alembic Migration Owner for any given development cycle.
- **Single Linear History:** Never create competing Alembic migration heads. Run `alembic heads` to ensure a single head revision exists.
- **Immutable Past:** Never edit or delete an already merged Alembic migration script. Create a new revision to alter schemas.
- **Migration Script Template:**
  ```bash
  cd backend
  alembic revision -m "add_table_name"
  ```
- Verify both upgrade and downgrade paths:
  ```bash
  alembic upgrade head
  alembic downgrade -1
  alembic upgrade head
  ```

---

## 6. Shared API Contract Change Procedure

If a proposed change affects an endpoint or data schema used by both frontend and backend:
1. Propose the schema change in `AGENT_HANDOFF.md`.
2. Update `API_CONTRACTS.md` with request/response examples and error shapes.
3. Coordinate with the frontend/backend counterpart to confirm agreement.
4. Implement both sides or provide backwards-compatible stub interfaces.
5. Record completion in `AGENT_HANDOFF.md`.

---

## 7. Security & Secrets Policy

- **Zero Credentials in Git:** Never commit `.env`, `.pem`, `.cert`, `.key`, or API tokens.
- **Placeholder Templates:** Only commit `.env.example` files containing non-sensitive placeholder values.
- **Startup Protection:** In production mode (`ENVIRONMENT=production`), the application verifies `SECRET_KEY` is not the default development key.
- **Safe Error Envelopes:** Never return raw database exceptions, SQL error messages, or internal stack traces in HTTP responses.
