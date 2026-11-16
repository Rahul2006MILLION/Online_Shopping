# BASKET — Git Workflow & Development Operations

This document establishes the Git discipline and daily operational routines for the BASKET engineering team.

---

## 1. Branching Topology

```text
main (Production / Demo Baseline — Protected)
  └── integration (Shared Active Development Trunk — Protected)
        ├── feature/catalogue-search        (Developer 1)
        ├── feature/cart-checkout           (Developer 2)
        ├── feature/kafka-outbox            (Developer 2)
        └── docs/developer-handoff          (Handoff & Documentation)
```

- **`main`:** Stable, verified demo code only. Direct commits and pushes are prohibited.
- **`integration`:** Shared integration branch. All feature branches branch from and merge into `integration`.
- **`feature/*`:** Isolated task branches for specific modules.
- **`docs/*`:** Dedicated documentation updates.

---

## 2. Parallel Development via Git Worktrees

When two developers (or two Antigravity agent sessions) work on the same machine, they **must not** edit the same working tree simultaneously. Use Git worktrees to create isolated directories:

```bash
# Clone primary repository
git clone https://github.com/Rahul2006MILLION/Online_Shopping basket
cd basket
git checkout integration
git pull origin integration

# Create isolated worktree for Developer 1 (Discovery & Search)
git worktree add ../basket-dev-1 -b feature/catalogue-search integration

# Create isolated worktree for Developer 2 (Cart & Checkout)
git worktree add ../basket-dev-2 -b feature/cart-checkout integration
```

Open `basket-dev-1` and `basket-dev-2` in separate Antigravity workspaces.

---

## 3. Feature Branch Routine

### Step 1: Start from Clean Integration
```bash
git fetch origin
git checkout integration
git pull --ff-only origin integration
git checkout -b feature/your-feature-name
```

### Step 2: Implement and Test Locally
Write code and tests. Before committing, run the complete verification gate:
```bash
./scripts/verify-environment.sh
```

### Step 3: Commit Using Conventional Commits
```bash
git add path/to/changed/files
git commit -m "feat(catalogue): implement category hierarchy endpoint"
```

### Step 4: Push and Open Pull Request
```bash
git push -u origin feature/your-feature-name
```
Open a Pull Request on GitHub targeting `integration`.

---

## 4. Pull Request Review & Merge Checklist

Before merging into `integration`, the reviewer must verify:
- [ ] PR targets `integration` (never `main`).
- [ ] All automated checks pass (`./scripts/verify-environment.sh`).
- [ ] Scope matches assigned task in `TASK_BREAKDOWN.md`.
- [ ] No `.env`, secrets, or private certificates committed.
- [ ] Database migrations are backwards-compatible and tested for downgrade.
- [ ] API changes match `API_CONTRACTS.md`.
- [ ] No unhandled exceptions or fake mock data presented as live.

**Merge Policy:** Use standard **Merge Commit** to preserve full feature commit history. Do not squash or rebase without explicit coordination.

---

## 5. Integration Owner Responsibilities

The designated Integration Owner is responsible for:
1. Maintaining `integration` branch health.
2. Reviewing and merging all feature PRs.
3. Coordinating shared database migrations to prevent multiple Alembic heads.
4. Promoting tested, demo-ready milestones from `integration` to `main`.
