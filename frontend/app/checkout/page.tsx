"use client";

import { ShopperGuard } from "@/components/auth/shopper-guard";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  HelpCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RazorpayPaymentButton } from "@/components/checkout/razorpay-modal";
import { apiClient, ApiClientError } from "@/lib/api/client";
import { createOrder, getOrder } from "@/lib/api/orders";
import { formatPrice } from "@/lib/utils";
import type { Address, Order, PaymentVerifyResponse } from "@/types";
import { useI18n } from "@/lib/i18n/i18n-context";

function CheckoutContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const reservationIdParam = searchParams.get("reservation_id");
  const quoteIdParam = searchParams.get("quote_id");
  const orderIdParam = searchParams.get("order_id");

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [derivedQuoteId, setDerivedQuoteId] = useState<string | null>(null);

  // Payment UI states
  const [verifyResponse, setVerifyResponse] = useState<PaymentVerifyResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [ambiguousState, setAmbiguousState] = useState(false);

  // Address state for new order creation
  const [addressId, setAddressId] = useState("");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchOrderDetails = useCallback(async (orderId: string): Promise<Order | null> => {
    try {
      const fetched = await getOrder(orderId);
      setOrder(fetched);
      if (fetched.status === "CONFIRMED") {
        setAmbiguousState(false);
        setError(null);
      } else if (fetched.payment_status === "REQUIRES_RECONCILIATION") {
        setAmbiguousState(true);
      }
      return fetched;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load order details.");
      return null;
    }
  }, []);

  // Initialize from query parameters
  useEffect(() => {
    if (orderIdParam) {
      setIsLoadingOrder(true);
      fetchOrderDetails(orderIdParam).finally(() => setIsLoadingOrder(false));
    }
  }, [orderIdParam, fetchOrderDetails]);

  // Fetch saved customer addresses if authenticated
  useEffect(() => {
    let isMounted = true;
    setIsLoadingAddresses(true);
    apiClient
      .getAddresses()
      .then((data) => {
        if (isMounted && Array.isArray(data) && data.length > 0) {
          setAddresses(data);
          const defaultAddr = data.find((a) => a.is_default) || data[0];
          if (defaultAddr) {
            setAddressId(defaultAddr.id);
          }
        }
      })
      .catch(() => {
        // Guests or unauthenticated sessions do not have saved addresses
      })
      .finally(() => {
        if (isMounted) setIsLoadingAddresses(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // If quote_id not passed in query params, fetch reservation to derive quote_id
  useEffect(() => {
    if (reservationIdParam && !quoteIdParam) {
      apiClient
        .getReservation(reservationIdParam)
        .then((res) => {
          if (res?.quote_id) {
            setDerivedQuoteId(res.quote_id);
          }
        })
        .catch(() => {
          // If unauthenticated or expired, backend order creation will handle authority
        });
    }
  }, [reservationIdParam, quoteIdParam]);

  // Clean up polling timer on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  // Server-authoritative polling fallback after ambiguous outcome or modal dismissal
  const startPollingFallback = useCallback(() => {
    if (!order) return;
    setIsPolling(true);
    setPollAttempt(0);

    let attempts = 0;
    const maxAttempts = 5;
    const pollIntervalMs = 2500;

    const poll = async () => {
      attempts += 1;
      setPollAttempt(attempts);

      const latest = await fetchOrderDetails(order.id);
      if (latest) {
        if (latest.status === "CONFIRMED") {
          setIsPolling(false);
          setError(null);
          return;
        }
        if (latest.payment_status === "REQUIRES_RECONCILIATION") {
          setIsPolling(false);
          setAmbiguousState(true);
          return;
        }
        if (latest.status === "CANCELLED") {
          setIsPolling(false);
          return;
        }
      }

      if (attempts < maxAttempts) {
        pollTimerRef.current = setTimeout(poll, pollIntervalMs);
      } else {
        setIsPolling(false);
        if (latest && latest.status !== "CONFIRMED") {
          setError(
            "Payment confirmation is taking longer than expected. Please check your orders page or click 'Check Status Now' before retrying."
          );
        }
      }
    };

    pollTimerRef.current = setTimeout(poll, 1500);
  }, [order, fetchOrderDetails]);

  const handleCreateOrder = async () => {
    if (!reservationIdParam) {
      setError("No active inventory reservation found.");
      return;
    }
    setIsCreatingOrder(true);
    setError(null);
    setFieldErrors({});

    try {
      const trimmedAddressId = addressId.trim();
      const created = await createOrder({
        reservation_id: reservationIdParam,
        quote_id: quoteIdParam || derivedQuoteId || undefined,
        delivery_address_id: trimmedAddressId || undefined,
      });
      setOrder(created);
      // Keep the order in the URL so a refresh resumes payment instead of starting over.
      router.replace(`/checkout?order_id=${encodeURIComponent(created.id)}`, { scroll: false });
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.status === 422 && Array.isArray(err.details)) {
          const fieldMap: Record<string, string> = {};
          for (const detail of err.details as Array<{ loc?: (string | number)[]; msg?: string }>) {
            if (detail.loc && detail.msg) {
              const field = detail.loc.filter((x) => x !== "body").join(".");
              if (field) {
                fieldMap[field] = detail.msg;
              }
            }
          }
          if (Object.keys(fieldMap).length > 0) {
            setFieldErrors(fieldMap);
          }
        }
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to create order from reservation.");
      }
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const handlePaymentSuccess = (result: PaymentVerifyResponse) => {
    setVerifyResponse(result);
    setAmbiguousState(false);
    setError(null);
    if (order) {
      setOrder({
        ...order,
        status: result.status,
        payment_status: result.payment_status,
        fulfilling_capture_id: result.fulfilling_capture_id,
      });
    }
  };

  const handlePaymentError = (err: Error) => {
    const isTransientOrInternal =
      err.message.includes("unexpected internal error") ||
      err.message.includes("Failed to fetch") ||
      err.message.includes("Network error") ||
      err.message.includes("timeout");

    if (isTransientOrInternal) {
      setError(
        "Payment was submitted to Razorpay. Verifying confirmation with server..."
      );
    } else {
      setError(err.message || "Payment verification failed");
    }
    // Immediately start server-side status refresh in case gateway completed asynchronously
    startPollingFallback();
  };

  return (
    <div className="container max-w-4xl py-8 px-4 sm:px-6">
      <div className="mb-6 flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-emerald-600" />
            {t("checkout.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("checkout.subtitle")}
          </p>
        </div>
        <Link href="/cart">
          <Button variant="ghost" size="sm" className="text-xs">
            {t("checkout.returnToCart")}
          </Button>
        </Link>
      </div>

      {error && order?.status !== "CONFIRMED" && verifyResponse?.status !== "CONFIRMED" && (
        <div className="mb-6 p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300 flex items-start gap-2.5">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Checkout Notice</p>
            <p className="text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* Ambiguous Reconciliation Warning */}
      {ambiguousState && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-lg text-sm text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <HelpCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <p className="font-semibold">Payment Under Verification (Requires Reconciliation)</p>
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              We received your payment initiation, but gateway confirmation is currently ambiguous.
              Our automated reconciliation service is verifying the status. Please do NOT re-submit payment;
              duplicate charges are strictly prevented.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 border-amber-400 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900"
              onClick={() => order && fetchOrderDetails(order.id)}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Check Status Now
            </Button>
          </div>
        </div>
      )}

      {/* Confirmed Success State */}
      {(order?.status === "CONFIRMED" || verifyResponse?.status === "CONFIRMED") && (
        <Card className="mb-6 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <div>
                <h2 className="text-lg font-bold text-emerald-900 dark:text-emerald-200">
                  {t("checkout.successTitle")}
                </h2>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  Order Number: <span className="font-mono font-semibold">{order?.order_number}</span>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white dark:bg-zinc-900 p-3.5 rounded-md border border-emerald-200 dark:border-emerald-900">
              <div>
                <span className="text-muted-foreground">Fulfilling Capture ID:</span>
                <p className="font-mono text-[11px] truncate">
                  {order?.fulfilling_capture_id || verifyResponse?.fulfilling_capture_id || "Recorded in Ledger"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Amount Paid:</span>
                <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {formatPrice(order?.total_payable_paise ?? verifyResponse?.amount_paid_paise ?? 0)}
                </p>
              </div>
            </div>
            {order?.guest_access_token && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md text-xs space-y-1.5">
                <span className="font-semibold text-amber-900 dark:text-amber-200 block">
                  Guest Order Access Token (Save this to view & track your order):
                </span>
                <p className="font-mono text-[11px] select-all bg-white dark:bg-black/40 p-2 rounded border border-amber-300 dark:border-amber-800 break-all text-foreground">
                  {order.guest_access_token}
                </p>
                <p className="text-[10px] text-amber-700 dark:text-amber-400">
                  Bookmark your order details or enter this token in the Orders page to track delivery status.
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <Link href="/orders">
                <Button variant="ghost" size="sm" className="text-xs">
                  {t("checkout.myOrders")}
                </Button>
              </Link>
              <Link
                href={
                  order?.id
                    ? `/orders/${order.id}${
                        order.guest_access_token
                          ? `?access_token=${encodeURIComponent(order.guest_access_token)}`
                          : ""
                      }`
                    : "/orders"
                }
              >
                <Button variant="outline" size="sm" className="text-xs">
                  {t("checkout.viewDetails")}
                </Button>
              </Link>
              <Link
                href={
                  order?.id
                    ? `/orders/${order.id}/track${
                        order.guest_access_token
                          ? `?access_token=${encodeURIComponent(order.guest_access_token)}`
                          : ""
                      }`
                    : "/orders"
                }
              >
                <Button size="sm" className="bg-brand-yellow hover:bg-brand-yellow-dark text-ink text-xs gap-1.5">
                  {t("checkout.trackOrder")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {!order && !reservationIdParam && !orderIdParam && !isLoadingOrder && (
        <Card className="mb-6">
          <CardContent className="space-y-3 py-8 text-center">
            <p className="font-semibold">Start checkout from your basket</p>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Review your items and choose “Checkout” in the basket. Prices are confirmed and stock is held for you before you pay.
            </p>
            <Link href="/cart"><Button size="sm">Go to basket</Button></Link>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Create Order from Reservation if no active order */}
      {!order && reservationIdParam && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-600" />
              {t("checkout.step1Title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {t("checkout.step1Subtitle")}
            </p>

            {/* Saved Addresses Dropdown (for authenticated users with saved addresses) */}
            {addresses.length > 0 && (
              <div className="space-y-1.5">
                <label htmlFor="addressSelect" className="text-xs font-medium text-foreground">
                  {t("checkout.savedAddresses")}
                </label>
                <select
                  id="addressSelect"
                  value={addressId}
                  onChange={(e) => {
                    setAddressId(e.target.value);
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.delivery_address_id;
                      return next;
                    });
                  }}
                  className="w-full text-xs p-2.5 rounded-md border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {addresses.map((addr) => (
                    <option key={addr.id} value={addr.id}>
                      {addr.recipient_name} — {addr.line1}, {addr.city}, {addr.state} {addr.postal_code}
                      {addr.is_default ? " (Default)" : ""}
                    </option>
                  ))}
                                  </select>
              </div>
            )}

            {fieldErrors.delivery_address_id && (
              <p className="text-xs font-medium text-red-600">{fieldErrors.delivery_address_id}</p>
            )}
            {!isLoadingAddresses && addresses.length === 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                You have no saved delivery address.{" "}
                <Link href="/account/addresses" className="font-semibold underline">Add an address</Link>{" "}
                and return to your basket to continue.
              </p>
            )}

            <Button
              className="w-full bg-brand-yellow hover:bg-brand-yellow-dark text-ink font-semibold text-xs h-10"
              onClick={handleCreateOrder}
              disabled={isCreatingOrder}
            >
              {isCreatingOrder ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("checkout.processing")}
                </>
              ) : (
                <>
                  {t("checkout.confirmAndPay")}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Order Summary & Authoritative Payment Initiation */}
      {order && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{t("checkout.orderSummary")}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={order.status === "CONFIRMED" ? "default" : "secondary"} className="text-[10px]">
                      {t(`status.order.${order.status}`)}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {t(`status.payment.${order.payment_status}`)}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">{t("orders.orderNum", { id: order.order_number })}</span>
                  <span className="font-mono font-medium">{order.order_number}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">Order ID:</span>
                  <span className="font-mono text-[11px] truncate max-w-[200px]">{order.id}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">{t("checkout.itemsCount", { n: order.items?.length ?? 1 })}:</span>
                  <span>{order.items?.length ?? 1} item(s)</span>
                </div>
                <div className="flex justify-between py-1.5 border-b">
                  <span className="text-muted-foreground">Currency:</span>
                  <span className="font-semibold">{order.currency}</span>
                </div>
              </CardContent>
            </Card>

            {/* Server-Side Polling State Indicator */}
            {isPolling && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span>Polling server for payment confirmation (attempt {pollAttempt}/5)...</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-6 px-2 text-blue-800"
                  onClick={() => fetchOrderDetails(order.id)}
                >
                  Refresh
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-semibold">{t("checkout.paymentSummary")}</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("checkout.subtotal")}</span>
                    <span>{formatPrice(order.subtotal_paise ?? order.total_payable_paise)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("checkout.gst")}</span>
                    <span>{formatPrice(order.total_tax_paise ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("checkout.delivery")}</span>
                    <span>{formatPrice(order.delivery_fee_paise ?? 0)}</span>
                  </div>
                  <div className="pt-2 border-t flex justify-between text-sm font-bold text-foreground">
                    <span>{t("checkout.totalPayable")}</span>
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {formatPrice(order.total_payable_paise)}
                    </span>
                  </div>
                </div>

                {/* Gateway Payment Button */}
                {order.status === "PENDING_PAYMENT" && (
                  <div className="pt-2">
                    <RazorpayPaymentButton
                      orderId={order.id}
                      amountPaise={order.total_payable_paise}
                      currency={order.currency}
                      disabled={isPolling || isLoadingOrder}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-11 shadow-sm"
                      onSuccess={handlePaymentSuccess}
                      onError={handlePaymentError}
                      onDismissOrAmbiguous={startPollingFallback}
                    />
                    <p className="text-[10px] text-center text-muted-foreground mt-2">
                      {t("checkout.securityNote")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Invariant Guarantees */}
            <div className="p-3 bg-muted/40 rounded-lg border text-[11px] text-muted-foreground space-y-1.5">
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span>Amounts are set by the server</span>
              </div>
              <p className="text-[10px] leading-relaxed">
                The amount you pay is calculated and recorded by BASKET before the payment window opens; it cannot be changed in the browser.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckoutPageInner() {
  return (
    <React.Suspense
      fallback={
        <div className="container max-w-4xl py-12 flex justify-center items-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      }
    >
      <CheckoutContent />
    </React.Suspense>
  );
}


export default function CheckoutPage() {
  return (
    <ShopperGuard>
      <CheckoutPageInner />
    </ShopperGuard>
  );
}
