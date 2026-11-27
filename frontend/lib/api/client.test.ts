import test from "node:test";
import assert from "node:assert/strict";
import { apiClient, ApiClientError } from "./client.ts";

test("ApiClient methods and error handling", async (t) => {
  const originalFetch = globalThis.fetch;

  t.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  await t.test("get() returns parsed json response", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "success" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const res = await apiClient.get<{ message: string }>("/test");
    assert.deepEqual(res, { message: "success" });
  });

  await t.test("post() sends serialized body and parses json", async () => {
    let capturedBody: string | undefined;
    let capturedMethod: string | undefined;

    globalThis.fetch = async (url, init) => {
      capturedMethod = init?.method;
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ id: "123" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    };

    const res = await apiClient.post<{ id: string }>("/items", { name: "apple" });
    assert.equal(capturedMethod, "POST");
    assert.equal(capturedBody, JSON.stringify({ name: "apple" }));
    assert.deepEqual(res, { id: "123" });
  });

  await t.test("patch() sends PATCH method and serialized body", async () => {
    let capturedMethod: string | undefined;
    let capturedBody: string | undefined;

    globalThis.fetch = async (url, init) => {
      capturedMethod = init?.method;
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ id: "123", quantity: 5 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const res = await apiClient.patch<{ id: string; quantity: number }>("/cart/items/123", {
      quantity: 5,
    });
    assert.equal(capturedMethod, "PATCH");
    assert.equal(capturedBody, JSON.stringify({ quantity: 5 }));
    assert.deepEqual(res, { id: "123", quantity: 5 });
  });

  await t.test("delete() supports HTTP 204 No Content with undefined return", async () => {
    let capturedMethod: string | undefined;

    globalThis.fetch = async (url, init) => {
      capturedMethod = init?.method;
      return new Response(null, {
        status: 204,
      });
    };

    const res = await apiClient.delete("/cart/items/123");
    assert.equal(capturedMethod, "DELETE");
    assert.equal(res, undefined);
  });

  await t.test("delete() supports HTTP 200 with response body", async () => {
    let capturedMethod: string | undefined;

    globalThis.fetch = async (url, init) => {
      capturedMethod = init?.method;
      return new Response(JSON.stringify({ removed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const res = await apiClient.delete<{ removed: boolean }>("/cart/items/123");
    assert.equal(capturedMethod, "DELETE");
    assert.deepEqual(res, { removed: true });
  });

  await t.test("throws structured ApiClientError on API error envelope", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "NOT_FOUND",
            message: "Item not found",
            request_id: "req-123",
          },
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );

    await assert.rejects(
      async () => {
        await apiClient.get("/items/999");
      },
      (err: unknown) => {
        assert(err instanceof ApiClientError);
        assert.equal(err.status, 404);
        assert.equal(err.code, "NOT_FOUND");
        assert.equal(err.requestId, "req-123");
        assert.equal(err.message, "Item not found");
        return true;
      }
    );
  });

  await t.test("getCategories() calls /api/v1/categories", async () => {
    let capturedUrl: string | URL | Request | undefined;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return new Response(JSON.stringify([{ id: "cat-1", name: "Electronics", slug: "electronics" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const categories = await apiClient.getCategories();
    assert.equal(capturedUrl, "http://localhost:8000/api/v1/categories");
    assert.equal(categories.length, 1);
    assert.equal(categories[0].name, "Electronics");
  });

  await t.test("getProducts() formats query parameters correctly", async () => {
    let capturedUrl: string | URL | Request | undefined;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ items: [], total: 0, page: 1, limit: 10, pages: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await apiClient.getProducts({
      category_slug: "fashion",
      search: "boots",
      min_price: 100000,
      in_stock: true,
      sort_by: "price_asc",
      page: 2,
      limit: 10,
    });

    assert(typeof capturedUrl === "string");
    assert(capturedUrl.includes("/api/v1/products?"));
    assert(capturedUrl.includes("category_slug=fashion"));
    assert(capturedUrl.includes("search=boots"));
    assert(capturedUrl.includes("min_price=100000"));
    assert(capturedUrl.includes("in_stock=true"));
    assert(capturedUrl.includes("sort_by=price_asc"));
    assert(capturedUrl.includes("page=2"));
    assert(capturedUrl.includes("limit=10"));
  });

  await t.test("getProduct() encodes product identifier in url", async () => {
    let capturedUrl: string | URL | Request | undefined;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return new Response(
        JSON.stringify({
          id: "prod-1",
          name: "Sample Product",
          slug: "sample-product",
          variants: [],
          images: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };

    const product = await apiClient.getProduct("sony-wh-1000xm5");
    assert.equal(capturedUrl, "http://localhost:8000/api/v1/products/sony-wh-1000xm5");
    assert.equal(product.slug, "sample-product");
  });
});

test("get() waits for a sleeping backend in the browser", async (t) => {
  const { isTransientFailure, BACKEND_WAKING_EVENT, BACKEND_READY_EVENT } = await import("./client.ts");
  const originalFetch = globalThis.fetch;
  const g = globalThis as unknown as { window?: EventTarget };
  const originalWindow = g.window;
  const originalDelays = apiClient.retryDelays;
  const events: string[] = [];
  const fakeWindow = new EventTarget();
  fakeWindow.addEventListener(BACKEND_WAKING_EVENT, () => events.push("waking"));
  fakeWindow.addEventListener(BACKEND_READY_EVENT, () => events.push("ready"));

  t.beforeEach(() => {
    g.window = fakeWindow;
    apiClient.retryDelays = [0, 0, 0];
    events.length = 0;
  });
  t.afterEach(() => {
    globalThis.fetch = originalFetch;
    g.window = originalWindow;
    apiClient.retryDelays = originalDelays;
  });

  await t.test("classifies only network/5xx gateway failures as transient", () => {
    assert.equal(isTransientFailure(new ApiClientError("x", 0, "NETWORK_ERROR")), true);
    assert.equal(isTransientFailure(new ApiClientError("x", 503, "HTTP_503")), true);
    assert.equal(isTransientFailure(new ApiClientError("x", 504, "HTTP_504")), true);
    assert.equal(isTransientFailure(new ApiClientError("x", 404, "NOT_FOUND")), false);
    assert.equal(isTransientFailure(new ApiClientError("x", 500, "INTERNAL")), false);
    assert.equal(isTransientFailure(new Error("x")), false);
  });

  await t.test("retries 503 and network errors, then succeeds and signals ready", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Failed to fetch");
      if (calls === 2) return new Response("", { status: 503 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const res = await apiClient.get<{ ok: boolean }>("/api/v1/products");
    assert.deepEqual(res, { ok: true });
    assert.equal(calls, 3);
    assert.deepEqual(events, ["waking", "ready"]);
  });

  await t.test("gives up after the retry schedule with the last error", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("", { status: 502 });
    };
    await assert.rejects(apiClient.get("/api/v1/products"), (err: unknown) => err instanceof ApiClientError && err.status === 502);
    assert.equal(calls, 4); // first try + 3 retries
    assert.deepEqual(events, ["waking", "ready"]);
  });

  await t.test("does not retry real errors such as 404", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "nope" } }), { status: 404 });
    };
    await assert.rejects(apiClient.get("/api/v1/products/missing"));
    assert.equal(calls, 1);
    assert.deepEqual(events, []);
  });
});
