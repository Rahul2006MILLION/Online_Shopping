import type {
  Address,
  AddressCreatePayload,
  AddressUpdatePayload,
  ApiErrorEnvelope,
  ApiInfoResponse,
  AuthResponse,
  Cart,
  CartItem,
  CartMergeResponse,
  Category,
  HealthResponse,
  MessageResponse,
  ProductDetail,
  ProductFilterParams,
  ProductListResponse,
  ReadyResponse,
  Retailer,
  TokenResponse,
  User,
  Quote,
  QuoteCreatePayload,
  QuoteValidationResult,
  Reservation,
  ReservationCreatePayload,
  ReservationReleaseResponse,
  Order,
  CreateOrderRequest,
  OrderListResponse,
  OrderCancellationResponse,
  OrderTrackingResponse,
  ReturnCreateRequest,
  OrderReturn,
  NotificationListResponse,
  PaymentInitiateResponse,
  PaymentVerifyRequest,
  PaymentVerifyResponse,
  PaymentRefundRequest,
  PaymentRefundResponse,
  SearchFilterParams,
  SearchResponse,
  SuggestionsResponse,
  AdminOverview,
  AdminRetailerListItem,
  AdminRetailerDetailResponse,
  AdminRetailerSalesAnalyticsResponse,
  RetailerDocumentItem,
  AdminCatalogueProductListItem,
  AdminCatalogueProductDetailResponse,
  AdminCatalogueProductCreatePayload,
  AdminCatalogueProductUpdatePayload,
  AdminCatalogueVariantItem,
  AdminCatalogueVariantCreatePayload,
  AdminCatalogueVariantUpdatePayload,
  AdminCategoryListItem,
  AdminCategoryCreatePayload,
  AdminDealListItem,
  AdminDealDetailResponse,
  AdminDealCreatePayload,
  AdminDealUpdatePayload,
  RetailerOverview,
  RetailerProfile,
  RetailerRegisterPayload,
  CatalogueLookupProduct,
  RetailerListingItem,
  RetailerListingCreatePayload,
  RetailerListingUpdatePayload,
  RetailerInventoryDashboard,
  RetailerInventoryItem,
  RetailerInventoryAdjustmentPayload,
  RetailerProductCreatePayload,
  RetailerOrderItem,
  RetailerOrderListItem,
  RetailerOrderListResponse,
  RetailerOrderDetailResponse,
  RetailerOrderStatusUpdatePayload,
  RetailerOfferItem,
  RetailerOfferCreatePayload,
  RetailerOfferUpdatePayload,
  RetailerAnalyticsResponse,
  MissionSummary,
  MissionDetail,
  MissionCreatePayload,
  MissionUpdatePayload,
  MissionItemAddPayload,
  MissionItemUpdatePayload,
  MissionItemReplacePayload,
  MissionAlternativeItem,
  MissionAddToCartResponse,
  MissionPreviewResponse,
  SubstituteType,
  SubstituteListResponse,
  CartItemReplaceRequest,
  CartItemReplaceResponse,
  CustomerPreferenceProfile,
  CustomerPreferenceProfileRequest,
  PersonalizationConsentResponse,
  RecurringIntention,
  RecurringIntentionCreateRequest,
  RecurringIntentionUpdateRequest,
  IntentMemoryItem,
  IntentMemoryItemCreateRequest,
  IntentOverviewResponse,
  IntentSuggestionResponse,
  PublicClaim,
  PublicListingPassport,
  PublicProductPassport,
  RetailerClaim,
  ClaimReviewHistoryItem,
  RetailerListingPassportDetail,
  RetailerListingPassportUpsertRequest,
  RetailerClaimCreateRequest,
  RetailerClaimUpdateRequest,
  AdminClaim,
  AdminClaimQueueResponse,
  AdminProductPassportUpsertRequest,
} from "@/types";

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly requestId?: string;
  public readonly details: unknown[];

  constructor(
    message: string,
    status: number,
    code = "UNKNOWN_ERROR",
    requestId?: string,
    details: unknown[] = []
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

/**
 * Hosted demo backends (e.g. Render's free plan) sleep when idle and need up to a
 * minute to start. Reads that fail with these statuses are retried with backoff
 * instead of leaving pages empty. Status 0 is a network failure.
 */
export const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([0, 502, 503, 504]);
export const WAKE_RETRY_DELAYS_MS: readonly number[] = [1500, 3000, 5000, 8000, 12000, 15000, 15000, 15000, 15000, 15000];
/** A read slower than this is reported as "server waking up". */
export const SLOW_REQUEST_MS = 4000;
export const BACKEND_WAKING_EVENT = "basket:backend-waking";
export const BACKEND_READY_EVENT = "basket:backend-ready";

export function isTransientFailure(err: unknown): boolean {
  return err instanceof ApiClientError && TRANSIENT_STATUSES.has(err.status);
}

function emitBackendEvent(name: string): void {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent(name));
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)(${name})=([^;]*)`));
  return match ? decodeURIComponent(match[3]) : null;
}

class ApiClient {
  private readonly baseUrl: string;
  private refreshPromise: Promise<TokenResponse | null> | null = null;

  constructor() {
    // "same-origin": call /api/v1 on the page's own host; the Next.js server
    // proxies it to the backend (shared two-laptop demo, one public URL).
    const configured = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
    // Server-rendered pages have no page host, so they call the proxy target directly.
    const serverTarget =
      typeof window === "undefined"
        ? process.env.BASKET_API_PROXY_TARGET?.replace(/\/+$/, "")
        : undefined;
    this.baseUrl =
      configured === "same-origin" ? serverTarget || "" : configured || "http://localhost:8000";
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const method = (options.method || "GET").toUpperCase();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers as Record<string, string>),
    };

    // Attach CSRF token on state-mutating browser requests if not already set
    if (["POST", "PATCH", "PUT", "DELETE"].includes(method) && !headers["X-CSRF-Token"]) {
      const csrfToken = getCookie("XSRF-TOKEN");
      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }
    }

    try {
      const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        ...options,
        headers,
      });

      if (!response.ok) {
        // Attempt single-flight token refresh on 401 (if not already retried and not an auth route)
        const isAuthRoute =
          endpoint.includes("/auth/login") ||
          endpoint.includes("/auth/register") ||
          endpoint.includes("/auth/refresh");

        if (response.status === 401 && !isRetry && !isAuthRoute) {
          const refreshed = await this.executeTokenRefresh();
          if (refreshed) {
            return this.request<T>(endpoint, options, true);
          }
          // Session could not be renewed: let the auth layer decide whether a
          // signed-in user must be sent back to the login page.
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("basket:session-expired"));
          }
        }

        let errorData: ApiErrorEnvelope | null = null;
        try {
          const errorText = await response.text();
          if (errorText && errorText.trim()) {
            errorData = JSON.parse(errorText) as ApiErrorEnvelope;
          }
        } catch {
          // Response body was not JSON
        }

        const code = errorData?.error?.code || `HTTP_${response.status}`;
        let message =
          errorData?.error?.message ||
          `API request failed with status ${response.status}`;
        const requestId =
          errorData?.error?.request_id ||
          response.headers.get("x-request-id") ||
          undefined;
        const details = errorData?.error?.details || [];

        // If backend returned generic validation message and details array contains field errors, enrich message
        if (
          code === "VALIDATION_ERROR" &&
          Array.isArray(details) &&
          details.length > 0 &&
          message === "The request payload validation failed."
        ) {
          const detailMsgs = (details as Array<{ loc?: (string | number)[]; msg?: string }>)
            .map((d) => {
              const field = d.loc?.filter((x) => x !== "body").join(".") || "field";
              return `${field}: ${d.msg || "invalid value"}`;
            })
            .filter(Boolean);
          if (detailMsgs.length > 0) {
            message = `The request payload validation failed: ${detailMsgs.join("; ")}`;
          }
        }

        throw new ApiClientError(
          message,
          response.status,
          code,
          requestId,
          details
        );
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const text = await response.text();
      if (!text || text.trim() === "") {
        return undefined as T;
      }

      return JSON.parse(text) as T;
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        throw err;
      }
      const message =
        err instanceof Error ? err.message : "Network error or server unreachable";
      throw new ApiClientError(message, 0, "NETWORK_ERROR");
    }
  }

  /**
   * Concurrency-safe token refresh avoiding duplicate simultaneous requests.
   */
  private async executeTokenRefresh(): Promise<TokenResponse | null> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.post<TokenResponse>("/api/v1/auth/refresh")
        .catch(() => null)
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }

  /** Backoff schedule for reads while the backend wakes; overridable in tests. */
  retryDelays: readonly number[] = WAKE_RETRY_DELAYS_MS;

  public async get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    // Server-side rendering and tests fail fast; only the browser waits for a
    // sleeping backend.
    if (typeof window === "undefined") {
      return this.request<T>(endpoint, { ...options, method: "GET" });
    }
    let waking = false;
    const slowTimer = setTimeout(() => {
      waking = true;
      emitBackendEvent(BACKEND_WAKING_EVENT);
    }, SLOW_REQUEST_MS);
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const result = await this.request<T>(endpoint, { ...options, method: "GET" });
          return result;
        } catch (err) {
          if (!isTransientFailure(err) || attempt >= this.retryDelays.length) throw err;
          if (!waking) {
            waking = true;
            emitBackendEvent(BACKEND_WAKING_EVENT);
          }
          await sleep(this.retryDelays[attempt]);
        }
      }
    } finally {
      clearTimeout(slowTimer);
      if (waking) emitBackendEvent(BACKEND_READY_EVENT);
    }
  }

  public async post<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public async put<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public async patch<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public async delete<T = void>(
    endpoint: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: "DELETE",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  // Baseline system health endpoints
  public async getHealth(): Promise<HealthResponse> {
    return this.get<HealthResponse>("/health");
  }

  public async getReady(): Promise<ReadyResponse> {
    return this.get<ReadyResponse>("/ready");
  }

  public async getInfo(): Promise<ApiInfoResponse> {
    return this.get<ApiInfoResponse>("/api/v1/info");
  }

  // Catalogue endpoints
  public async getCategories(): Promise<Category[]> {
    return this.get<Category[]>("/api/v1/categories");
  }

  public async getRetailers(): Promise<Retailer[]> {
    return this.get<Retailer[]>("/api/v1/retailers");
  }

  public async getProducts(
    params: ProductFilterParams = {}
  ): Promise<ProductListResponse> {
    const searchParams = new URLSearchParams();
    if (params.category_slug) searchParams.set("category_slug", params.category_slug);
    if (params.category_id) searchParams.set("category_id", params.category_id);
    if (params.retailer_id) searchParams.set("retailer_id", params.retailer_id);
    if (params.brand) searchParams.set("brand", params.brand);
    if (params.search) searchParams.set("search", params.search);
    if (params.min_price !== undefined)
      searchParams.set("min_price", params.min_price.toString());
    if (params.max_price !== undefined)
      searchParams.set("max_price", params.max_price.toString());
    if (params.in_stock !== undefined)
      searchParams.set("in_stock", params.in_stock.toString());
    if (params.sort_by) searchParams.set("sort_by", params.sort_by);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());

    const qs = searchParams.toString();
    return this.get<ProductListResponse>(`/api/v1/products${qs ? `?${qs}` : ""}`);
  }

  public async getProduct(idOrSlug: string): Promise<ProductDetail> {
    return this.get<ProductDetail>(`/api/v1/products/${encodeURIComponent(idOrSlug)}`);
  }

  // ================= Identity & Authentication =================
  public async register(payload: {
    email: string;
    password: string;
    full_name: string;
    phone?: string | null;
  }): Promise<AuthResponse> {
    return this.post<AuthResponse>("/api/v1/auth/register", payload);
  }

  public async registerRetailer(
    payload: RetailerRegisterPayload
  ): Promise<AuthResponse> {
    return this.post<AuthResponse>("/api/v1/auth/retailer/register", payload);
  }

  public async login(payload: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    return this.post<AuthResponse>("/api/v1/auth/login", payload);
  }

  public async refreshToken(): Promise<TokenResponse> {
    return this.post<TokenResponse>("/api/v1/auth/refresh");
  }

  public async logout(): Promise<MessageResponse> {
    return this.post<MessageResponse>("/api/v1/auth/logout");
  }

  public async logoutAll(): Promise<MessageResponse> {
    return this.post<MessageResponse>("/api/v1/auth/logout-all");
  }

  public async getProfile(): Promise<User> {
    return this.get<User>("/api/v1/users/me");
  }

  // ================= Address Management =================
  public async getAddresses(): Promise<Address[]> {
    return this.get<Address[]>("/api/v1/addresses");
  }

  public async createAddress(payload: AddressCreatePayload): Promise<Address> {
    return this.post<Address>("/api/v1/addresses", payload);
  }

  public async updateAddress(
    id: string,
    payload: AddressUpdatePayload
  ): Promise<Address> {
    return this.patch<Address>(`/api/v1/addresses/${encodeURIComponent(id)}`, payload);
  }

  public async deleteAddress(id: string): Promise<MessageResponse> {
    return this.delete<MessageResponse>(`/api/v1/addresses/${encodeURIComponent(id)}`);
  }

  // ================= Cart Management =================
  public async getCart(): Promise<Cart> {
    return this.get<Cart>("/api/v1/cart");
  }

  public async addToCart(listingId: string, quantity = 1): Promise<Cart> {
    return this.post<Cart>("/api/v1/cart/items", {
      listing_id: listingId,
      quantity,
    });
  }

  public async updateCartItemQuantity(
    itemId: string,
    quantity: number
  ): Promise<Cart> {
    return this.patch<Cart>(`/api/v1/cart/items/${encodeURIComponent(itemId)}`, {
      quantity,
    });
  }

  public async removeCartItem(itemId: string): Promise<Cart> {
    return this.delete<Cart>(`/api/v1/cart/items/${encodeURIComponent(itemId)}`);
  }

  public async clearCart(): Promise<Cart> {
    return this.delete<Cart>("/api/v1/cart");
  }

  public async mergeCart(guestToken?: string): Promise<CartMergeResponse> {
    return this.post<CartMergeResponse>("/api/v1/cart/merge", {
      guest_token: guestToken,
    });
  }

  // ================= Substitute Intelligence (Phase 2B) =================
  public async getListingSubstitutes(
    listingId: string,
    params?: {
      type?: SubstituteType;
      limit?: number;
      in_stock_only?: boolean;
    }
  ): Promise<SubstituteListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set("type", params.type);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.in_stock_only !== undefined)
      searchParams.set("in_stock_only", String(params.in_stock_only));

    const qs = searchParams.toString();
    const endpoint = `/api/v1/substitutes/listings/${encodeURIComponent(listingId)}${qs ? `?${qs}` : ""}`;
    return this.get<SubstituteListResponse>(endpoint);
  }

  public async getCartItemSubstitutes(
    itemId: string,
    params?: {
      type?: SubstituteType;
      limit?: number;
      in_stock_only?: boolean;
    }
  ): Promise<SubstituteListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set("type", params.type);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.in_stock_only !== undefined)
      searchParams.set("in_stock_only", String(params.in_stock_only));

    const qs = searchParams.toString();
    const endpoint = `/api/v1/cart/items/${encodeURIComponent(itemId)}/substitutes${qs ? `?${qs}` : ""}`;
    return this.get<SubstituteListResponse>(endpoint);
  }

  public async replaceCartItem(
    itemId: string,
    payload: CartItemReplaceRequest
  ): Promise<CartItemReplaceResponse> {
    return this.post<CartItemReplaceResponse>(
      `/api/v1/cart/items/${encodeURIComponent(itemId)}/replace`,
      payload
    );
  }

  // ================= Quotes & Pricing (Phase 2C) =================
  public async createQuote(payload: QuoteCreatePayload = {}): Promise<Quote> {
    return this.post<Quote>("/api/v1/quotes", payload);
  }

  public async getQuote(quoteId: string): Promise<Quote> {
    return this.get<Quote>(`/api/v1/quotes/${encodeURIComponent(quoteId)}`);
  }

  public async validateQuote(quoteId: string): Promise<QuoteValidationResult> {
    return this.post<QuoteValidationResult>(
      `/api/v1/quotes/${encodeURIComponent(quoteId)}/validate`,
      {}
    );
  }

  public async refreshQuote(quoteId: string): Promise<Quote> {
    return this.post<Quote>(
      `/api/v1/quotes/${encodeURIComponent(quoteId)}/refresh`,
      {}
    );
  }

  public async listQuotes(): Promise<Quote[]> {
    return this.get<Quote[]>("/api/v1/quotes");
  }

  // Phase 2D: Inventory Reservations
  public async createReservation(
    payload: ReservationCreatePayload,
    idempotencyKey?: string,
  ): Promise<Reservation> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }
    return this.post<Reservation>("/api/v1/reservations", payload, { headers });
  }

  public async getReservation(reservationId: string): Promise<Reservation> {
    return this.get<Reservation>(
      `/api/v1/reservations/${encodeURIComponent(reservationId)}`,
    );
  }

  public async releaseReservation(
    reservationId: string,
  ): Promise<ReservationReleaseResponse> {
    return this.post<ReservationReleaseResponse>(
      `/api/v1/reservations/${encodeURIComponent(reservationId)}/release`,
      {},
    );
  }

  // ================= Orders & Checkout (Phase 2E) =================
  public async createOrder(
    payload: CreateOrderRequest,
    idempotencyKey?: string,
  ): Promise<Order> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }
    return this.post<Order>("/api/v1/orders", payload, { headers });
  }

  public async getOrder(orderId: string, accessToken?: string): Promise<Order> {
    const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : "";
    return this.get<Order>(`/api/v1/orders/${encodeURIComponent(orderId)}${query}`);
  }

  public async guestLookupOrder(orderNumber: string, accessToken: string): Promise<Order> {
    return this.post<Order>("/api/v1/orders/guest-lookup", {
      order_number: orderNumber,
      access_token: accessToken,
    });
  }

  public async listOrders(
    limit = 20,
    offset = 0,
    status?: string,
    search?: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<OrderListResponse> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    const res = await this.get<OrderListResponse>(`/api/v1/orders?${params.toString()}`);
    const items = res.items || res.orders || [];
    return {
      total: res.total ?? items.length,
      items,
      orders: res.orders || items,
    };
  }

  public async cancelOrder(
    orderId: string,
    reason: string,
    idempotencyKey?: string,
    accessToken?: string,
  ): Promise<OrderCancellationResponse> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    if (accessToken) headers["X-Guest-Access-Token"] = accessToken;
    return this.post<OrderCancellationResponse>(
      `/api/v1/orders/${encodeURIComponent(orderId)}/cancel`,
      { reason },
      { headers },
    );
  }

  public async getOrderTracking(
    orderId: string,
    accessToken?: string,
  ): Promise<OrderTrackingResponse> {
    const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : "";
    return this.get<OrderTrackingResponse>(
      `/api/v1/orders/${encodeURIComponent(orderId)}/tracking${query}`,
    );
  }

  public async requestReturn(
    orderId: string,
    payload: ReturnCreateRequest,
    idempotencyKey?: string,
    accessToken?: string,
  ): Promise<OrderReturn> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    if (accessToken) headers["X-Guest-Access-Token"] = accessToken;
    return this.post<OrderReturn>(
      `/api/v1/orders/${encodeURIComponent(orderId)}/returns`,
      payload,
      { headers },
    );
  }

  public async listOrderReturns(
    orderId: string,
    accessToken?: string,
  ): Promise<OrderReturn[]> {
    const query = accessToken ? `?access_token=${encodeURIComponent(accessToken)}` : "";
    return this.get<OrderReturn[]>(
      `/api/v1/orders/${encodeURIComponent(orderId)}/returns${query}`,
    );
  }

  public async listNotifications(
    limit = 50,
    offset = 0,
  ): Promise<NotificationListResponse> {
    return this.get<NotificationListResponse>(
      `/api/v1/notifications?limit=${encodeURIComponent(limit)}&skip=${encodeURIComponent(offset)}`,
    );
  }

  public async getUnreadNotificationCount(): Promise<{ unread_count: number }> {
    return this.get<{ unread_count: number }>("/api/v1/notifications/unread-count");
  }

  public async markNotificationAsRead(
    notificationId: string,
  ): Promise<{ success: boolean }> {
    return this.post<{ success: boolean }>(
      `/api/v1/notifications/${encodeURIComponent(notificationId)}/read`,
      {},
    );
  }

  // ================= Payments & Refunds (Phase 2F) =================
  public async initiatePayment(
    orderId: string,
    idempotencyKey?: string,
  ): Promise<PaymentInitiateResponse> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }
    return this.post<PaymentInitiateResponse>(
      `/api/v1/orders/${encodeURIComponent(orderId)}/payments`,
      {},
      { headers },
    );
  }

  public async verifyPayment(
    orderId: string,
    payload: PaymentVerifyRequest,
  ): Promise<PaymentVerifyResponse> {
    return this.post<PaymentVerifyResponse>(
      `/api/v1/orders/${encodeURIComponent(orderId)}/payments/verify`,
      payload,
    );
  }

  /**
   * Issue a refund against an order capture.
   * ADMIN / INTERNAL ONLY since the 2026-11 audit: customers receive 403. Customer
   * refunds flow through order cancellation and the returns workflow instead.
   */
  public async requestRefund(
    orderId: string,
    payload: PaymentRefundRequest,
    idempotencyKey?: string,
  ): Promise<PaymentRefundResponse> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }
    return this.post<PaymentRefundResponse>(
      `/api/v1/orders/${encodeURIComponent(orderId)}/refunds`,
      payload,
      { headers },
    );
  }

  // Universal Search Methods (Phase 3E)
  public async searchProducts(
    params: SearchFilterParams = {},
  ): Promise<SearchResponse> {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.category) query.set("category", params.category);
    if (params.brand) query.set("brand", params.brand);
    if (params.retailer_id) query.set("retailer_id", params.retailer_id);
    if (params.min_price !== undefined) query.set("min_price", String(params.min_price));
    if (params.max_price !== undefined) query.set("max_price", String(params.max_price));
    if (params.in_stock !== undefined) query.set("in_stock", String(params.in_stock));
    if (params.sort) query.set("sort", params.sort);
    if (params.page !== undefined) query.set("page", String(params.page));
    if (params.page_size !== undefined) query.set("page_size", String(params.page_size));
    if (params.force_fallback) query.set("force_fallback", "true");

    const qs = query.toString();
    const endpoint = qs ? `/api/v1/search?${qs}` : "/api/v1/search";
    return this.get<SearchResponse>(endpoint);
  }

  public async getSearchSuggestions(
    query: string,
    limit: number = 5,
  ): Promise<SuggestionsResponse> {
    const qs = new URLSearchParams({ q: query, limit: String(limit) }).toString();
    return this.get<SuggestionsResponse>(`/api/v1/search/suggestions?${qs}`);
  }

  // ================= Retailer Portal Methods (Phase 5A) =================
  public async getRetailerProfile(): Promise<RetailerProfile> {
    return this.get<RetailerProfile>("/api/v1/retailer/profile");
  }

  public async updateRetailerProfile(
    payload: Partial<RetailerProfile>
  ): Promise<RetailerProfile> {
    return this.put<RetailerProfile>("/api/v1/retailer/profile", payload);
  }

  public async getRetailerOverview(): Promise<RetailerOverview> {
    return this.get<RetailerOverview>("/api/v1/retailer/overview");
  }

  // ================= Admin Portal Methods (Phase 5A) =================
  public async getAdminOverview(): Promise<AdminOverview> {
    return this.get<AdminOverview>("/api/v1/admin/overview");
  }

  public async listAdminRetailers(params?: {
    status?: string;
    search?: string;
    state?: string;
    is_active?: boolean;
  }): Promise<AdminRetailerListItem[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.search) query.set("search", params.search);
    if (params?.state) query.set("state", params.state);
    if (params?.is_active !== undefined)
      query.set("is_active", String(params.is_active));
    const qs = query.toString();
    const endpoint = qs
      ? `/api/v1/admin/retailers?${qs}`
      : "/api/v1/admin/retailers";
    return this.get<AdminRetailerListItem[]>(endpoint);
  }

  public async getAdminRetailerAnalytics(
    retailerId: string
  ): Promise<AdminRetailerSalesAnalyticsResponse> {
    return this.get<AdminRetailerSalesAnalyticsResponse>(
      `/api/v1/admin/retailers/${encodeURIComponent(retailerId)}/analytics`
    );
  }

  public async verifyRetailer(
    retailerId: string,
    status: string,
    rejectionReason?: string
  ): Promise<AdminRetailerListItem> {
    return this.post<AdminRetailerListItem>(
      `/api/v1/admin/retailers/${encodeURIComponent(retailerId)}/verify`,
      { status, rejection_reason: rejectionReason }
    );
  }

  public async getAdminRetailer(
    retailerId: string
  ): Promise<AdminRetailerDetailResponse> {
    return this.get<AdminRetailerDetailResponse>(
      `/api/v1/admin/retailers/${encodeURIComponent(retailerId)}`
    );
  }

  public async verifyAdminRetailerDocument(
    retailerId: string,
    documentId: string,
    status: string,
    rejectionReason?: string
  ): Promise<RetailerDocumentItem> {
    return this.post<RetailerDocumentItem>(
      `/api/v1/admin/retailers/${encodeURIComponent(retailerId)}/documents/${encodeURIComponent(documentId)}/verify`,
      { status, rejection_reason: rejectionReason }
    );
  }

  // ================= Admin Catalogue Management (Phase 5C) =================

  public async listAdminCatalogueProducts(params?: {
    search?: string;
    category_id?: string;
    brand?: string;
    is_active?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<AdminCatalogueProductListItem[]> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.category_id) qs.set("category_id", params.category_id);
    if (params?.brand) qs.set("brand", params.brand);
    if (params?.is_active !== undefined) qs.set("is_active", String(params.is_active));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<AdminCatalogueProductListItem[]>(
      `/api/v1/admin/catalogue/products${query}`
    );
  }

  public async getAdminCatalogueProduct(
    productId: string
  ): Promise<AdminCatalogueProductDetailResponse> {
    return this.get<AdminCatalogueProductDetailResponse>(
      `/api/v1/admin/catalogue/products/${encodeURIComponent(productId)}`
    );
  }

  public async createAdminCatalogueProduct(
    payload: AdminCatalogueProductCreatePayload
  ): Promise<AdminCatalogueProductDetailResponse> {
    return this.post<AdminCatalogueProductDetailResponse>(
      "/api/v1/admin/catalogue/products",
      payload
    );
  }

  public async updateAdminCatalogueProduct(
    productId: string,
    payload: AdminCatalogueProductUpdatePayload
  ): Promise<AdminCatalogueProductDetailResponse> {
    return this.put<AdminCatalogueProductDetailResponse>(
      `/api/v1/admin/catalogue/products/${encodeURIComponent(productId)}`,
      payload
    );
  }

  public async deleteAdminCatalogueProduct(productId: string): Promise<void> {
    return this.delete<void>(
      `/api/v1/admin/catalogue/products/${encodeURIComponent(productId)}`
    );
  }

  public async createAdminCatalogueVariant(
    productId: string,
    payload: AdminCatalogueVariantCreatePayload
  ): Promise<AdminCatalogueVariantItem> {
    return this.post<AdminCatalogueVariantItem>(
      `/api/v1/admin/catalogue/products/${encodeURIComponent(productId)}/variants`,
      payload
    );
  }

  public async updateAdminCatalogueVariant(
    variantId: string,
    payload: AdminCatalogueVariantUpdatePayload
  ): Promise<AdminCatalogueVariantItem> {
    return this.put<AdminCatalogueVariantItem>(
      `/api/v1/admin/catalogue/variants/${encodeURIComponent(variantId)}`,
      payload
    );
  }

  public async deleteAdminCatalogueVariant(variantId: string): Promise<void> {
    return this.delete<void>(
      `/api/v1/admin/catalogue/variants/${encodeURIComponent(variantId)}`
    );
  }

  public async listAdminCatalogueCategories(): Promise<AdminCategoryListItem[]> {
    return this.get<AdminCategoryListItem[]>("/api/v1/admin/catalogue/categories");
  }

  public async createAdminCatalogueCategory(
    payload: AdminCategoryCreatePayload
  ): Promise<AdminCategoryListItem> {
    return this.post<AdminCategoryListItem>(
      "/api/v1/admin/catalogue/categories",
      payload
    );
  }

  // ================= Admin Deals & Promotions (Phase 5C) =================

  public async listAdminDeals(params?: {
    status?: string;
    scope?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<AdminDealListItem[]> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.scope) qs.set("scope", params.scope);
    if (params?.search) qs.set("search", params.search);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<AdminDealListItem[]>(`/api/v1/admin/deals${query}`);
  }

  public async getAdminDeal(dealId: string): Promise<AdminDealDetailResponse> {
    return this.get<AdminDealDetailResponse>(
      `/api/v1/admin/deals/${encodeURIComponent(dealId)}`
    );
  }

  public async createAdminDeal(
    payload: AdminDealCreatePayload
  ): Promise<AdminDealDetailResponse> {
    return this.post<AdminDealDetailResponse>("/api/v1/admin/deals", payload);
  }

  public async updateAdminDeal(
    dealId: string,
    payload: AdminDealUpdatePayload
  ): Promise<AdminDealDetailResponse> {
    return this.put<AdminDealDetailResponse>(
      `/api/v1/admin/deals/${encodeURIComponent(dealId)}`,
      payload
    );
  }

  public async deleteAdminDeal(dealId: string): Promise<void> {
    return this.delete<void>(`/api/v1/admin/deals/${encodeURIComponent(dealId)}`);
  }

  // ================= Retailer Listings & Inventory (Phase 5B) =================

  public async getRetailerCatalogueProducts(params?: {
    search?: string;
    category_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<CatalogueLookupProduct[]> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.category_id) qs.set("category_id", params.category_id);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<CatalogueLookupProduct[]>(`/api/v1/retailer/catalogue/products${query}`);
  }

  public async listRetailerListings(params?: {
    search?: string;
    is_active?: boolean;
    is_low_stock?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ items: RetailerListingItem[]; total: number; limit: number; offset: number }> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.is_active !== undefined) qs.set("is_active", String(params.is_active));
    if (params?.is_low_stock !== undefined) qs.set("is_low_stock", String(params.is_low_stock));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<{ items: RetailerListingItem[]; total: number; limit: number; offset: number }>(
      `/api/v1/retailer/listings${query}`
    );
  }

  public async createRetailerListing(
    payload: RetailerListingCreatePayload
  ): Promise<RetailerListingItem> {
    return this.post<RetailerListingItem>("/api/v1/retailer/listings", payload);
  }

  public async getRetailerListing(listingId: string): Promise<RetailerListingItem> {
    return this.get<RetailerListingItem>(
      `/api/v1/retailer/listings/${encodeURIComponent(listingId)}`
    );
  }

  public async updateRetailerListing(
    listingId: string,
    payload: RetailerListingUpdatePayload
  ): Promise<RetailerListingItem> {
    return this.put<RetailerListingItem>(
      `/api/v1/retailer/listings/${encodeURIComponent(listingId)}`,
      payload
    );
  }

  public async deleteRetailerListing(listingId: string): Promise<MessageResponse> {
    return this.delete<MessageResponse>(
      `/api/v1/retailer/listings/${encodeURIComponent(listingId)}`
    );
  }

  public async getRetailerInventory(params?: {
    search?: string;
    status_filter?: string;
    limit?: number;
    offset?: number;
  }): Promise<RetailerInventoryDashboard> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.status_filter) qs.set("status_filter", params.status_filter);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<RetailerInventoryDashboard>(`/api/v1/retailer/inventory${query}`);
  }

  public async adjustRetailerInventory(
    listingId: string,
    payload: RetailerInventoryAdjustmentPayload
  ): Promise<RetailerInventoryItem> {
    return this.post<RetailerInventoryItem>(
      `/api/v1/retailer/listings/${encodeURIComponent(listingId)}/inventory`,
      payload
    );
  }

  public async createRetailerProduct(
    payload: RetailerProductCreatePayload
  ): Promise<RetailerListingItem> {
    return this.post<RetailerListingItem>("/api/v1/retailer/products", payload);
  }

  public async listRetailerOrders(params?: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<RetailerOrderListResponse> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.search) qs.set("search", params.search);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<RetailerOrderListResponse>(`/api/v1/retailer/orders${query}`);
  }

  public async getRetailerOrder(orderId: string): Promise<RetailerOrderDetailResponse> {
    return this.get<RetailerOrderDetailResponse>(
      `/api/v1/retailer/orders/${encodeURIComponent(orderId)}`
    );
  }

  public async updateRetailerOrderStatus(
    orderId: string,
    payload: RetailerOrderStatusUpdatePayload
  ): Promise<RetailerOrderDetailResponse> {
    return this.patch<RetailerOrderDetailResponse>(
      `/api/v1/retailer/orders/${encodeURIComponent(orderId)}/status`,
      payload
    );
  }

  public async listRetailerOffers(): Promise<RetailerOfferItem[]> {
    return this.get<RetailerOfferItem[]>("/api/v1/retailer/offers");
  }

  public async createRetailerOffer(
    payload: RetailerOfferCreatePayload
  ): Promise<RetailerOfferItem> {
    return this.post<RetailerOfferItem>("/api/v1/retailer/offers", payload);
  }

  public async updateRetailerOffer(
    offerId: string,
    payload: RetailerOfferUpdatePayload
  ): Promise<RetailerOfferItem> {
    return this.put<RetailerOfferItem>(
      `/api/v1/retailer/offers/${encodeURIComponent(offerId)}`,
      payload
    );
  }

  public async deleteRetailerOffer(offerId: string): Promise<MessageResponse> {
    return this.delete<MessageResponse>(
      `/api/v1/retailer/offers/${encodeURIComponent(offerId)}`
    );
  }

  public async getRetailerAnalytics(): Promise<RetailerAnalyticsResponse> {
    return this.get<RetailerAnalyticsResponse>("/api/v1/retailer/analytics");
  }

  // Basket Mission Methods
  public async createMission(
    payload: MissionCreatePayload
  ): Promise<MissionDetail> {
    return this.post<MissionDetail>("/api/v1/missions", payload);
  }

  public async previewMission(
    payload: MissionCreatePayload
  ): Promise<MissionPreviewResponse> {
    return this.post<MissionPreviewResponse>("/api/v1/missions/preview", payload);
  }

  public async getMissions(): Promise<MissionSummary[]> {
    return this.get<MissionSummary[]>("/api/v1/missions");
  }

  public async getMission(id: string): Promise<MissionDetail> {
    return this.get<MissionDetail>(`/api/v1/missions/${encodeURIComponent(id)}`);
  }

  public async updateMission(
    id: string,
    payload: MissionUpdatePayload
  ): Promise<MissionDetail> {
    return this.patch<MissionDetail>(
      `/api/v1/missions/${encodeURIComponent(id)}`,
      payload
    );
  }

  public async deleteMission(id: string): Promise<void> {
    return this.delete<void>(`/api/v1/missions/${encodeURIComponent(id)}`);
  }

  public async addMissionItem(
    missionId: string,
    payload: MissionItemAddPayload
  ): Promise<MissionDetail> {
    return this.post<MissionDetail>(
      `/api/v1/missions/${encodeURIComponent(missionId)}/items`,
      payload
    );
  }

  public async updateMissionItem(
    missionId: string,
    itemId: string,
    payload: MissionItemUpdatePayload
  ): Promise<MissionDetail> {
    return this.patch<MissionDetail>(
      `/api/v1/missions/${encodeURIComponent(missionId)}/items/${encodeURIComponent(itemId)}`,
      payload
    );
  }

  public async deleteMissionItem(
    missionId: string,
    itemId: string
  ): Promise<MissionDetail> {
    return this.delete<MissionDetail>(
      `/api/v1/missions/${encodeURIComponent(missionId)}/items/${encodeURIComponent(itemId)}`
    );
  }

  public async getMissionItemAlternatives(
    missionId: string,
    itemId: string
  ): Promise<MissionAlternativeItem[]> {
    return this.get<MissionAlternativeItem[]>(
      `/api/v1/missions/${encodeURIComponent(missionId)}/items/${encodeURIComponent(itemId)}/alternatives`
    );
  }

  public async replaceMissionItem(
    missionId: string,
    itemId: string,
    payload: MissionItemReplacePayload
  ): Promise<MissionDetail> {
    return this.post<MissionDetail>(
      `/api/v1/missions/${encodeURIComponent(missionId)}/items/${encodeURIComponent(itemId)}/replace`,
      payload
    );
  }

  public async addMissionToCart(
    missionId: string
  ): Promise<MissionAddToCartResponse> {
    return this.post<MissionAddToCartResponse>(
      `/api/v1/missions/${encodeURIComponent(missionId)}/add-to-cart`,
      {}
    );
  }

  // ================= Basket Intent Memory (Phase 2C) =================
  public async getIntentOverview(): Promise<IntentOverviewResponse> {
    return this.get<IntentOverviewResponse>("/api/v1/intent/overview");
  }

  public async getPreferenceProfile(): Promise<CustomerPreferenceProfile> {
    return this.get<CustomerPreferenceProfile>("/api/v1/intent/profile");
  }

  public async updatePreferenceProfile(
    payload: CustomerPreferenceProfileRequest
  ): Promise<CustomerPreferenceProfile> {
    return this.put<CustomerPreferenceProfile>(
      "/api/v1/intent/profile",
      payload
    );
  }

  public async updatePersonalizationConsent(
    enabled: boolean
  ): Promise<PersonalizationConsentResponse> {
    return this.patch<PersonalizationConsentResponse>(
      "/api/v1/intent/consent",
      {
        personalization_enabled: enabled,
      }
    );
  }

  public async listRecurringIntentions(
    activeOnly = false
  ): Promise<RecurringIntention[]> {
    const q = activeOnly ? "?active_only=true" : "";
    return this.get<RecurringIntention[]>(`/api/v1/intent/recurring${q}`);
  }

  public async createRecurringIntention(
    payload: RecurringIntentionCreateRequest
  ): Promise<RecurringIntention> {
    return this.post<RecurringIntention>("/api/v1/intent/recurring", payload);
  }

  public async updateRecurringIntention(
    id: string,
    payload: RecurringIntentionUpdateRequest
  ): Promise<RecurringIntention> {
    return this.put<RecurringIntention>(
      `/api/v1/intent/recurring/${encodeURIComponent(id)}`,
      payload
    );
  }

  public async toggleRecurringIntentionStatus(
    id: string,
    isActive: boolean
  ): Promise<RecurringIntention> {
    return this.patch<RecurringIntention>(
      `/api/v1/intent/recurring/${encodeURIComponent(id)}/status`,
      { is_active: isActive }
    );
  }

  public async deleteRecurringIntention(id: string): Promise<MessageResponse> {
    return this.delete<MessageResponse>(
      `/api/v1/intent/recurring/${encodeURIComponent(id)}`
    );
  }

  public async listIntentMemories(): Promise<IntentMemoryItem[]> {
    return this.get<IntentMemoryItem[]>("/api/v1/intent/memories");
  }

  public async createIntentMemory(
    payload: IntentMemoryItemCreateRequest
  ): Promise<IntentMemoryItem> {
    return this.post<IntentMemoryItem>("/api/v1/intent/memories", payload);
  }

  public async deleteIntentMemory(id: string): Promise<MessageResponse> {
    return this.delete<MessageResponse>(
      `/api/v1/intent/memories/${encodeURIComponent(id)}`
    );
  }

  public async clearAllIntentMemories(): Promise<MessageResponse> {
    return this.delete<MessageResponse>("/api/v1/intent/clear-all");
  }

  public async getIntentSuggestions(
    categoryId?: string
  ): Promise<IntentSuggestionResponse> {
    const q = categoryId ? `?category_id=${encodeURIComponent(categoryId)}` : "";
    return this.get<IntentSuggestionResponse>(`/api/v1/intent/suggestions${q}`);
  }

  // ================= Basket Product Passport APIs (Phase 2D) =================

  public async getProductPassport(
    productIdOrSlug: string,
    listingId?: string
  ): Promise<PublicProductPassport> {
    const q = listingId ? `?listing_id=${encodeURIComponent(listingId)}` : "";
    return this.get<PublicProductPassport>(
      `/api/v1/products/${encodeURIComponent(productIdOrSlug)}/passport${q}`
    );
  }

  public async getListingPassport(listingId: string): Promise<PublicListingPassport> {
    return this.get<PublicListingPassport>(
      `/api/v1/passport/listings/${encodeURIComponent(listingId)}`
    );
  }

  public async getRetailerListingPassport(
    listingId: string
  ): Promise<RetailerListingPassportDetail> {
    return this.get<RetailerListingPassportDetail>(
      `/api/v1/retailer/passport/listings/${encodeURIComponent(listingId)}`
    );
  }

  public async upsertRetailerListingPassport(
    listingId: string,
    payload: RetailerListingPassportUpsertRequest
  ): Promise<RetailerListingPassportDetail> {
    return this.put<RetailerListingPassportDetail>(
      `/api/v1/retailer/passport/listings/${encodeURIComponent(listingId)}`,
      payload
    );
  }

  public async submitRetailerClaim(
    listingId: string,
    payload: RetailerClaimCreateRequest
  ): Promise<RetailerClaim> {
    return this.post<RetailerClaim>(
      `/api/v1/retailer/passport/listings/${encodeURIComponent(listingId)}/claims`,
      payload
    );
  }

  public async updateRetailerClaim(
    claimId: string,
    payload: RetailerClaimUpdateRequest
  ): Promise<RetailerClaim> {
    return this.put<RetailerClaim>(
      `/api/v1/retailer/passport/claims/${encodeURIComponent(claimId)}`,
      payload
    );
  }

  public async listRetailerClaims(listingId?: string): Promise<RetailerClaim[]> {
    const q = listingId ? `?listing_id=${encodeURIComponent(listingId)}` : "";
    return this.get<RetailerClaim[]>(`/api/v1/retailer/passport/claims${q}`);
  }

  public async getRetailerClaimHistory(
    claimId: string
  ): Promise<ClaimReviewHistoryItem[]> {
    return this.get<ClaimReviewHistoryItem[]>(
      `/api/v1/retailer/passport/claims/${encodeURIComponent(claimId)}/history`
    );
  }

  public async getAdminClaimsQueue(params?: {
    status?: string;
    scope?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<AdminClaimQueueResponse> {
    const qp = new URLSearchParams();
    if (params?.status) qp.set("status", params.status);
    if (params?.scope) qp.set("scope", params.scope);
    if (params?.search) qp.set("search", params.search);
    if (params?.page) qp.set("page", params.page.toString());
    if (params?.limit) qp.set("limit", params.limit.toString());
    const qs = qp.toString() ? `?${qp.toString()}` : "";
    return this.get<AdminClaimQueueResponse>(`/api/v1/admin/passport/queue${qs}`);
  }

  public async verifyAdminClaim(claimId: string): Promise<AdminClaim> {
    return this.post<AdminClaim>(
      `/api/v1/admin/passport/claims/${encodeURIComponent(claimId)}/verify`,
      {}
    );
  }

  public async rejectAdminClaim(
    claimId: string,
    rejectionReason: string
  ): Promise<AdminClaim> {
    return this.post<AdminClaim>(
      `/api/v1/admin/passport/claims/${encodeURIComponent(claimId)}/reject`,
      { rejection_reason: rejectionReason }
    );
  }

  public async getAdminClaimHistory(
    claimId: string
  ): Promise<ClaimReviewHistoryItem[]> {
    return this.get<ClaimReviewHistoryItem[]>(
      `/api/v1/admin/passport/claims/${encodeURIComponent(claimId)}/history`
    );
  }

  public async upsertAdminCanonicalPassport(
    productId: string,
    payload: AdminProductPassportUpsertRequest
  ): Promise<PublicProductPassport> {
    return this.put<PublicProductPassport>(
      `/api/v1/admin/passport/products/${encodeURIComponent(productId)}`,
      payload
    );
  }
}

export const apiClient = new ApiClient();
