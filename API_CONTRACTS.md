# BASKET — REST API Contracts & Interface Specifications

> **Document Status:** Authoritative API Contract Baseline  
> **Base Path:** `/api/v1`  
> **Specification Version:** 1.0.0-draft  

---

## 1. General Conventions

- **Protocol:** HTTPS, JSON payloads, UTF-8 encoded.
- **Identifiers:** External entity IDs are UUIDv4 strings.
- **Timestamps:** UTC ISO-8601 strings (e.g. `2026-11-16T18:30:00Z`).
- **Monetary Values:** Non-negative integers representing minor currency units (paise for INR; ₹499.00 = `49900`). Floats are strictly prohibited.
- **Pagination:** List endpoints use cursor-based pagination with query parameters `limit` (default 20, max 100) and `cursor`. Responses include `next_cursor` (null if no further items).
- **Client Identity:**
  - Authenticated Users: `Authorization: Bearer <jwt>`
  - Guest Shoppers: `X-Session-Token: <token>` (32-byte secure bearer token from `POST /api/v1/sessions/guest`)
- **Idempotency:** State-mutating commerce operations (`POST /api/v1/checkout`) require header `Idempotency-Key: <uuid>`.

---

## 2. Standard Error Envelope

Every 4xx and 5xx response returns a uniform structured error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request could not be processed due to validation failures.",
    "request_id": "c7a8b4e2-9f31-4c12-b123-9a4f6d8e2001",
    "details": [
      {
        "loc": ["body", "shipping_address", "phone"],
        "msg": "Invalid phone number format",
        "type": "value_error"
      }
    ]
  }
}
```

### Standard Machine-Readable Error Codes
- `VALIDATION_ERROR` (400 / 422) — Payload syntax or Pydantic constraint failure.
- `UNAUTHORIZED` (401) — Missing, invalid, or expired session token / JWT.
- `FORBIDDEN` (403) — Caller does not own the requested order or resource.
- `NOT_FOUND` (404) — Requested entity does not exist or route is disabled in production.
- `PRICE_CHANGED` (409) — Current database price does not match quote token.
- `INSUFFICIENT_STOCK` (409) — Requested quantity exceeds available inventory.
- `REQUEST_IN_PROGRESS` (409) — Concurrent request with same idempotency key is executing.
- `RESERVATION_EXPIRED` (409) — Inventory reservation expired before confirmation.
- `QUOTE_EXPIRED` (410) — HMAC quote token exceeded 5-minute validity window.
- `IDEMPOTENCY_PAYLOAD_MISMATCH` (422) — Same idempotency key re-sent with different payload.
- `SERVICE_UNAVAILABLE` (503) — Required dependency (database) unreachable.

---

## 3. Implemented Endpoints (Phase 0 Foundation)

These endpoints are currently active in `backend/app/main.py` and covered by automated test suites.

### 3.1 Process Liveness Probe
`GET /health`
- **Purpose:** Indicates whether the Python/FastAPI process is alive.
- **Auth:** None (Public)
- **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "service": "basket-backend",
    "environment": "development"
  }
  ```

### 3.2 Dependency Readiness Probe
`GET /ready`
- **Purpose:** Verifies whether downstream dependencies (database engine) are reachable.
- **Auth:** None (Public)
- **Response (200 OK — Connected):**
  ```json
  {
    "status": "ready",
    "service": "basket-backend",
    "checks": {
      "database": {
        "status": "connected"
      }
    }
  }
  ```
- **Response (200 OK — Degraded Development Mode):**
  *(Returned in non-production when DATABASE_URL is not set)*
  ```json
  {
    "status": "degraded",
    "service": "basket-backend",
    "checks": {
      "database": {
        "status": "unconfigured",
        "message": "DATABASE_URL not set; running in degraded mode"
      }
    }
  }
  ```
- **Response (503 Service Unavailable — Connection Failure or Unconfigured in Production):**
  ```json
  {
    "status": "not_ready",
    "service": "basket-backend",
    "checks": {
      "database": {
        "status": "unreachable",
        "message": "Database ping failed"
      }
    }
  }
  ```

### 3.3 API System Info
`GET /api/v1/info`
- **Purpose:** Returns API service metadata and version.
- **Auth:** None (Public)
- **Response (200 OK):**
  ```json
  {
    "project": "BASKET Backend",
    "version": "v1",
    "environment": "development"
  }
  ```

---

## 4. Planned Endpoints (Phase 1 Commerce)

These contracts define the target interfaces for Phase 1 parallel development.

### 4.1 Guest Session Management
`POST /api/v1/sessions/guest`
- **Purpose:** Generate a secure guest shopper session token.
- **Auth:** None
- **Request Body:** `{}`
- **Response (201 Created):**
  ```json
  {
    "session_token": "bk_gst_8f3a9e1b2c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
    "expires_at": "2026-12-16T18:30:00Z"
  }
  ```

### 4.2 Product Discovery & Catalogue
`GET /api/v1/categories`
- **Purpose:** Retrieve hierarchical category tree.
- **Response (200 OK):**
  ```json
  {
    "categories": [
      {
        "id": "e4b2c1a0-1234-4567-89ab-cdef01234567",
        "slug": "grocery-staples",
        "name": "Grocery & Staples",
        "parent_id": null
      }
    ]
  }
  ```

`GET /api/v1/products`
- **Purpose:** Browse paginated active products.
- **Query Params:** `category_id`, `limit=20`, `cursor`
- **Response (200 OK):**
  ```json
  {
    "items": [
      {
        "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        "title": "Organic Basmati Rice",
        "brand": "India Gate",
        "category_id": "e4b2c1a0-1234-4567-89ab-cdef01234567",
        "min_price_paise": 49900,
        "currency": "INR",
        "in_stock": true
      }
    ],
    "next_cursor": "eyJjcmVhdGVkX2F0IjoxNzAwMDAwMDAwLCJpZCI6IjEyMyJ9"
  }
  ```

`GET /api/v1/search`
- **Purpose:** Text search and faceted filtering via OpenSearch.
- **Query Params:** `q=rice`, `category`, `min_price_paise`, `max_price_paise`, `in_stock=true`, `limit=20`, `cursor`
- **Response (200 OK):**
  ```json
  {
    "items": [...],
    "facets": {
      "categories": [{"id": "...", "name": "Rice", "count": 12}],
      "brands": [{"name": "India Gate", "count": 5}]
    },
    "total": 12,
    "next_cursor": null
  }
  ```

### 4.3 Cart Management
- `GET /api/v1/cart` — Retrieve caller's current cart.
- `POST /api/v1/cart/items` — Add or increment an item `{ "listing_id": "uuid", "quantity": 1 }`.
- `PATCH /api/v1/cart/items/{item_id}` — Update item quantity `{ "quantity": 3 }`.
- `DELETE /api/v1/cart/items/{item_id}` — Remove item from cart.

### 4.4 Checkout Quote & Order Placement

#### Generate Checkout Quote
`POST /api/v1/checkout/quote`
- **Headers:** `Authorization: Bearer <jwt>` or `X-Session-Token: <token>`
- **Request Body:**
  ```json
  {
    "items": [
      {
        "listing_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "quantity": 2
      }
    ]
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "quote_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "items": [
      {
        "listing_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "product_title": "Organic Basmati Rice",
        "quantity": 2,
        "unit_price_paise": 49900,
        "line_total_paise": 99800
      }
    ],
    "subtotal_paise": 99800,
    "estimated_tax_paise": 0,
    "delivery_fee_paise": 0,
    "total_amount_paise": 99800,
    "currency": "INR",
    "expires_at": "2026-11-16T18:50:00Z"
  }
  ```

#### Place Order (Checkout)
`POST /api/v1/checkout`
- **Headers:**  
  `Idempotency-Key: <uuid>` (Mandatory)  
  `Authorization: Bearer <jwt>` (Optional)  
  `X-Session-Token: <token>` (Required if unauthenticated)
- **Request Body:**
  ```json
  {
    "quote_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "shipping_address": {
      "full_name": "Rahul Sharma",
      "address_line1": "Flat 402, Green Heights",
      "city": "Bengaluru",
      "state": "Karnataka",
      "postal_code": "560001",
      "country": "IN",
      "phone": "+919876543210"
    },
    "guest_email": "rahul.sharma@example.com"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "order_id": "9a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
    "status": "PENDING_PAYMENT",
    "total_amount_paise": 99800,
    "currency": "INR",
    "items": [
      {
        "listing_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "quantity": 2,
        "unit_price_paise": 49900,
        "line_total_paise": 99800
      }
    ],
    "reservation": {
      "status": "ACTIVE",
      "expires_at": "2026-11-16T18:55:00Z"
    },
    "created_at": "2026-11-16T18:45:00Z"
  }
  ```

#### Demo Order Confirmation
`POST /api/v1/orders/{order_id}/demo-confirm`
- **Purpose:** Server-verified confirmation for testing and hackathon demo runs.
- **Gating:** Available only when `DEMO_MODE=True` and `ENVIRONMENT!=production`. In production, returns `404 Not Found`.
- **Auth:** Caller must own the order (matching JWT or session token).
- **Response (200 OK):**
  ```json
  {
    "order_id": "9a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
    "status": "CONFIRMED",
    "confirmed_at": "2026-11-16T18:47:00Z"
  }
  ```
