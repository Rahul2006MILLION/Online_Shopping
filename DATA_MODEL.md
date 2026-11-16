# BASKET — Data Model, Schemas and Invariants

> **Document Status:** Authoritative Data Architecture  
> **Last Updated:** 2026-11-16  
> **Applied Migration Status:** Baseline marker `0001_initial_baseline` applied; Phase 1 commerce tables pending.  

---

## 1. Actual vs Proposed Database State

### Actual Repository State (Phase 0)
- **Alembic Head:** `0001_initial_baseline.py`
- **Tables Applied:** None (baseline marker migration contains `pass`).
- **Engines Verified:** PostgreSQL engine lifecycle with SSL; SQLite in-memory test harness with `StaticPool`.

### Proposed Schema (Phase 1 Target)
The following tables are planned for authoring in `0002_phase1_commerce_schema.py`. **Do not represent these as applied migrations until the Alembic revision is created and merged.**

---

## 2. Reconciled Relational Schema (Phase 1 Target)

```text
       ┌──────────────┐             ┌──────────────┐
       │    users     │             │guest_sessions│
       └──────┬───────┘             └──────┬───────┘
              │ 0..1                       │ 0..1
              └──────────────┬─────────────┘
                             │
                             ▼
                     ┌───────────────┐
                     │    orders     │◄────────────┐
                     └───┬───────┬───┘             │
                         │       │                 │
              1..*       │       │ 1..*            │ 1
        ┌────────────────┘       └─────────┐       │
        ▼                                  ▼       │
 ┌─────────────┐                    ┌──────────────────────┐
 │ order_items │                    │inventory_reservations│
 └──────┬──────┘                    └──────────┬───────────┘
        │                                      │
        │ references                           │ references
        ▼                                      ▼
 ┌─────────────────────────────────────────────────────────┐
 │                     store_listings                      │
 └────────────────────────────┬────────────────────────────┘
                              │
               1..*           │           1..1
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
 ┌──────────────┐                            ┌──────────────┐
 │    prices    │                            │store_inventory
 └──────────────┘                            └──────────────┘
```

### 2.1 Identity & Sessions
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'CUSTOMER', -- CUSTOMER, STORE_MANAGER, ADMIN
    phone VARCHAR(20) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE guest_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA256 of 32-byte session token
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
```

### 2.2 Retailers & Stores
```sql
CREATE TABLE retailers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    pin_code VARCHAR(10) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.3 Catalogue, Listings, Prices & Inventory
```sql
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    parent_id UUID NULL REFERENCES categories(id) ON DELETE SET NULL,
    display_order INT NOT NULL DEFAULT 0
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    brand VARCHAR(100) NOT NULL,
    description TEXT NULL,
    is_approved BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL UNIQUE,
    attributes JSONB NOT NULL DEFAULT '{}', -- e.g. {"weight": "1kg", "packaging": "Pouch"}
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE store_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_store_variant UNIQUE (store_id, variant_id)
);

CREATE TABLE prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES store_listings(id) ON DELETE CASCADE,
    amount_paise INT NOT NULL CHECK (amount_paise >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ NULL
);
-- Partial unique index guarantees at most ONE active price per listing
CREATE UNIQUE INDEX uq_prices_current_listing 
    ON prices(listing_id) 
    WHERE is_current = TRUE;

CREATE TABLE store_inventory (
    listing_id UUID PRIMARY KEY REFERENCES store_listings(id) ON DELETE CASCADE,
    on_hand_quantity INT NOT NULL DEFAULT 0,
    reserved_quantity INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_inventory_quantities CHECK (
        on_hand_quantity >= reserved_quantity AND reserved_quantity >= 0
    )
);
```

### 2.4 Carts, Orders & Reservations
```sql
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NULL REFERENCES users(id) ON DELETE CASCADE,
    guest_session_id UUID NULL REFERENCES guest_sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_cart_owner CHECK (
        (user_id IS NOT NULL) OR (guest_session_id IS NOT NULL)
    )
);

CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES store_listings(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cart_listing UNIQUE (cart_id, listing_id)
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
    guest_session_id UUID NULL REFERENCES guest_sessions(id) ON DELETE SET NULL,
    guest_email VARCHAR(255) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT', -- PENDING_PAYMENT, CONFIRMED, PAYMENT_FAILED, CANCELLED
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    total_amount_paise INT NOT NULL CHECK (total_amount_paise >= 0),
    shipping_address JSONB NOT NULL,
    idempotency_key VARCHAR(255) NULL, -- Audit tracking only
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_order_ownership CHECK (
        (user_id IS NOT NULL) OR 
        (guest_session_id IS NOT NULL AND guest_email IS NOT NULL)
    )
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES store_listings(id) ON DELETE RESTRICT,
    product_title VARCHAR(255) NOT NULL,
    unit_price_paise INT NOT NULL CHECK (unit_price_paise >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES store_listings(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, CONFIRMED, EXPIRED, RELEASED
    expires_at TIMESTAMPTZ NOT NULL,
    confirmed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.5 Eventing & Reliability
```sql
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    partition_key VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, CLAIMED, PUBLISHED, FAILED
    claim_token UUID NULL,
    claimed_at TIMESTAMPTZ NULL,
    lease_expires_at TIMESTAMPTZ NULL,
    retry_count INT NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ NULL
);
CREATE INDEX ix_outbox_claim ON outbox_events(status, lease_expires_at, created_at);

CREATE TABLE idempotency_records (
    key_hash VARCHAR(64) PRIMARY KEY, -- SHA256(client_scope + ":" + endpoint + ":" + idempotency_key)
    client_scope VARCHAR(100) NOT NULL,
    endpoint VARCHAR(100) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_code INT NULL,
    response_body JSONB NULL,
    status VARCHAR(20) NOT NULL, -- IN_PROGRESS, SUCCESS, FAILED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
```

---

## 3. The 10 Outstanding Decisions & Resolution Path

1. **Reservation Model (Flat vs Nested):** Standardized on flat `inventory_reservations` where each row represents an item reservation tied to `order_id`.
2. **Circular Foreign Key:** `orders` is inserted first with status `PENDING_PAYMENT`, followed by child `inventory_reservations` records referencing `orders.id`.
3. **Search Versioning:** OpenSearch external versioning must use millisecond timestamps (`occurred_at_ms`) across both catalogue and inventory threshold events.
4. **Concurrent Idempotency:** Catch unique key collisions on `idempotency_records` and return `409 Conflict (REQUEST_IN_PROGRESS)`.
5. **Quote Binding:** Quote token contains `items_hash` and item array; server re-verifies price and stock from PostgreSQL during checkout.
6. **Guest Retention:** 30-day TTL on `guest_sessions`; account linking on future registration matching email.
7. **Atomic Expiry Worker:** Reservation expiry daemon updates `reserved_quantity`, sets `inventory_reservations.status = 'EXPIRED'`, and updates `orders.status = 'CANCELLED'`.
8. **Outbox Schema:** Columns `topic` and `partition_key` are explicitly included.
9. **DLQ Policy:** Max 3 retries before routing to `basket.<domain>.dlq` with Kafka offset commit.
10. **Canonical Naming:** Standardized on `store_listings` across all tables, models, and contracts.

---

## 4. Migration Discipline

- Authoring must be coordinated by the Integration Owner.
- Never edit an existing migration script.
- Test both `upgrade` and `downgrade` locally before submitting a PR.
