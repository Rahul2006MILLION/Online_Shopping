"use client";

import { ShopperGuard } from "@/components/auth/shopper-guard";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Info,
  Loader2,
  Minus,
  Plus,
  Receipt,
  RefreshCw,
  ShieldCheck,
  ShoppingBasket,
  Store,
  Trash2,
  Truck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubstituteModal } from "@/components/substitutes/SubstituteModal";
import { useCart } from "@/lib/cart/cart-context";
import { createQuote, refreshQuote } from "@/lib/api/quotes";
import { ApiClientError } from "@/lib/api/client";
import { reservationApi } from "@/lib/api/reservations";
import { formatPrice } from "@/lib/utils";
import { NegotiatorPanel } from "@/components/phase3/negotiator-panel";
import { useAuth } from "@/lib/auth/auth-context";
import { useI18n } from "@/lib/i18n/i18n-context";
import type {
  CartItem,
  Quote,
  QuoteValidationIssue,
  Reservation,
} from "@/types";
import { useLiveUpdates } from "@/lib/realtime";

const COUPON_KEY = "basket.checkout.coupon";

function CartPageInner() {
  const {
    cart,
    items,
    itemCount,
    totalQuantity,
    subtotalPaise,
    isLoading,
    isMutating,
    error,
    warnings,
    updateQuantity,
    removeItem,
    clearCart,
    refreshCart,
  } = useCart();
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();
  useLiveUpdates(["price.", "listing.", "inventory.", "store_inventory.", "offer.", "variant."], () => void refreshCart());

  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  // Substitute Intelligence State (Phase 2B)
  const [substituteItem, setSubstituteItem] = useState<CartItem | null>(null);
  const [isSubstituteModalOpen, setIsSubstituteModalOpen] = useState(false);

  const handleOpenSubstituteModal = (item: CartItem) => {
    setSubstituteItem(item);
    setIsSubstituteModalOpen(true);
  };

  const handleSubstituteReplaced = async () => {
    await refreshCart();
  };

  // Quote State (Phase 2C - Server-Authoritative Pricing & Persistent Quotes)
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  // Coupon: the server validates and prices it; the page only sends the code.
  const [couponCode, setCouponCode] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [couponRestored, setCouponRestored] = useState(false);
  useEffect(() => {
    // Restore after mount (not during render) to avoid a hydration mismatch.
    try {
      const saved = window.sessionStorage.getItem(COUPON_KEY) ?? "";
      if (saved) {
        setCouponCode(saved);
        setCouponInput(saved);
      }
    } catch {
      /* storage unavailable */
    }
    setCouponRestored(true);
  }, []);
  const [couponStatus, setCouponStatus] = useState<
    "idle" | "applying" | "applied" | "ineligible" | "invalid"
  >("idle");
  const [rejectedCode, setRejectedCode] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<QuoteValidationIssue[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isRefreshingQuote, setIsRefreshingQuote] = useState(false);

  // Reservation State (Phase 2D - Inventory Reservations & Concurrency Protection)
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [isReserving, setIsReserving] = useState(false);
  const [reservationError, setReservationError] = useState<string | null>(null);
  const [reservationTimeRemaining, setReservationTimeRemaining] = useState<number | null>(null);
  const [isReleasing, setIsReleasing] = useState(false);

  // Fetch or generate persistent pricing quote when cart items change
  useEffect(() => {
    if (!items || items.length === 0) {
      setQuote(null);
      setValidationIssues([]);
      return;
    }

    if (!couponRestored) return;
    let isMounted = true;
    const loadQuote = async () => {
      setIsQuoteLoading(true);
      setQuoteError(null);
      if (couponCode) setCouponStatus("applying");
      try {
        let newQuote;
        try {
          newQuote = await createQuote(couponCode ? { discount_code: couponCode } : {});
        } catch (err: unknown) {
          if (couponCode && err instanceof ApiClientError && err.code === "INVALID_DISCOUNT_CODE") {
            // Unknown/expired code: tell the shopper and keep the cart usable without it.
            if (isMounted) {
              setRejectedCode(couponCode);
              setCouponStatus("invalid");
            }
            return;
          }
          throw err;
        }
        if (isMounted) {
          setQuote(newQuote);
          setValidationIssues([]);
          if (couponCode) setCouponStatus(newQuote.discount_code_applied ? "applied" : "ineligible");
        }
      } catch (err: unknown) {
        if (isMounted) {
          setQuoteError(
            err instanceof Error ? err.message : "Failed to calculate guaranteed quote"
          );
        }
      } finally {
        if (isMounted) {
          setIsQuoteLoading(false);
        }
      }
    };

    loadQuote();

    return () => {
      isMounted = false;
    };
  }, [items, couponCode, couponRestored]);

  // Keep the coupon across page refreshes in this tab (never stored server-side here).
  useEffect(() => {
    if (!couponRestored) return;
    try {
      if (couponCode) window.sessionStorage.setItem(COUPON_KEY, couponCode);
      else window.sessionStorage.removeItem(COUPON_KEY);
    } catch {
      /* storage unavailable: the coupon simply is not remembered */
    }
  }, [couponCode, couponRestored]);

  const applyCoupon = () => {
    const code = couponInput.trim();
    if (!code) return;
    setRejectedCode(null);
    // A new code replaces the old one; the reservation is for the old quote.
    setReservation(null);
    setReservationTimeRemaining(null);
    if (code === couponCode) setCouponStatus("applying");
    setCouponCode(code);
  };
  const removeCoupon = () => {
    setRejectedCode(null);
    setCouponStatus("idle");
    setCouponInput("");
    setReservation(null);
    setReservationTimeRemaining(null);
    setCouponCode("");
  };

  // TTL Countdown Timer for the active quote (15-minute guarantee)
  useEffect(() => {
    if (!quote || quote.status !== "ACTIVE" || !quote.expires_at) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const expires = new Date(quote.expires_at).getTime();
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((expires - now) / 1000));
      setTimeRemaining(diffSec);

      if (diffSec === 0) {
        setValidationIssues([
          {
            code: "QUOTE_EXPIRED",
            message:
              "Your 15-minute price guarantee has expired. Please refresh to lock in current live prices and GST rates.",
          },
        ]);
      }
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    return () => clearInterval(timerInterval);
  }, [quote]);

  // TTL Countdown Timer for active inventory reservation (Phase 2D)
  useEffect(() => {
    if (
      !reservation ||
      reservation.status !== "ACTIVE" ||
      !reservation.expires_at
    ) {
      setReservationTimeRemaining(null);
      return;
    }

    const updateResTimer = () => {
      const expires = new Date(reservation.expires_at).getTime();
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((expires - now) / 1000));
      setReservationTimeRemaining(diffSec);

      if (diffSec === 0) {
        setReservation((prev) =>
          prev ? { ...prev, status: "EXPIRED", is_expired: true } : null
        );
      }
    };

    updateResTimer();
    const interval = setInterval(updateResTimer, 1000);
    return () => clearInterval(interval);
  }, [reservation]);

  const handleRefreshQuote = async () => {
    if (!quote) return;
    setIsRefreshingQuote(true);
    setQuoteError(null);
    try {
      const refreshed = await refreshQuote(quote.id);
      setQuote(refreshed);
      setValidationIssues([]);
      setReservation(null);
      setReservationTimeRemaining(null);
    } catch (err: unknown) {
      setQuoteError(
        err instanceof Error ? err.message : "Failed to refresh pricing quote"
      );
    } finally {
      setIsRefreshingQuote(false);
    }
  };

  const handleCreateReservation = async () => {
    if (!quote) return;
    setIsReserving(true);
    setReservationError(null);
    try {
      const res = await reservationApi.createReservation({ quote_id: quote.id });
      setReservation(res);
    } catch (err: unknown) {
      setReservationError(
        err instanceof Error ? err.message : "Insufficient inventory available to reserve."
      );
    } finally {
      setIsReserving(false);
    }
  };

  const handleReleaseReservation = async () => {
    if (!reservation) return;
    setIsReleasing(true);
    try {
      await reservationApi.releaseReservation(reservation.id);
      setReservation(null);
      setReservationTimeRemaining(null);
    } catch (err: unknown) {
      setReservationError(
        err instanceof Error ? err.message : "Failed to release reservation."
      );
    } finally {
      setIsReleasing(false);
    }
  };

  const handleQuantityChange = async (itemId: string, newQty: number) => {
    if (newQty < 1 || newQty > 10) return;
    setActiveItemId(itemId);
    try {
      await updateQuantity(itemId, newQty);
    } catch {
      // Error handled in cart context
    } finally {
      setActiveItemId(null);
    }
  };

  const handleRemove = async (itemId: string) => {
    setActiveItemId(itemId);
    try {
      await removeItem(itemId);
    } catch {
      // Error handled in cart context
    } finally {
      setActiveItemId(null);
    }
  };

  const handleClear = async () => {
    if (!window.confirm("Are you sure you want to clear your shopping cart?")) {
      return;
    }
    setClearing(true);
    try {
      await clearCart();
    } finally {
      setClearing(false);
    }
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-24 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
        <p className="text-sm text-muted-foreground font-medium">
          Loading your universal basket...
        </p>
      </div>
    );
  }

  // Empty state
  if (!items || items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-xl text-center space-y-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-yellow/25 text-ink">
          <ShoppingBasket className="h-10 w-10" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            {t("cart.emptyTitle")}
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {t("cart.emptySubtitle")}
          </p>
        </div>
        <div>
          <Link href="/products">
            <Button className="bg-brand-yellow hover:bg-brand-yellow-dark text-ink font-semibold px-6 h-11 shadow-sm">
              {t("cart.explore")}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Group items by retailer for multi-retailer visibility
  const itemsByRetailer = items.reduce<Record<string, CartItem[]>>((acc, item) => {
    const key = item.retailer_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  // Check if quote is currently stale or expired
  const isQuoteStale =
    validationIssues.length > 0 ||
    (timeRemaining !== null && timeRemaining <= 0) ||
    quote?.status === "SUPERSEDED" ||
    quote?.status === "EXPIRED";

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
      {/* Breadcrumb & Header */}
      <div className="space-y-1">
        <div className="flex items-center text-xs text-muted-foreground gap-1.5">
          <Link href="/" className="hover:text-foreground">
            {t("nav.home") || "Home"}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">{t("cart.breadcrumb")}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
              {t("cart.title")}
              <Badge
                variant="outline"
                className="text-emerald-700 border-emerald-600/40 text-xs py-0.5"
              >
                {totalQuantity} {totalQuantity === 1 ? t("cart.itemCountSingle") : t("cart.itemCount", { n: totalQuantity })}
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("cart.retailersCount", { stores: cart?.retailers.length || 1 })}
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={isMutating || clearing}
            className="text-xs text-muted-foreground hover:text-red-600 self-start sm:self-auto"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {t("cart.clear")}
          </Button>
        </div>
      </div>

      {/* Repricing & Quote Expiry Warning Banner (Phase 2C Acceptance) */}
      {isQuoteStale && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-amber-950 dark:text-amber-100">
                  Pricing Quote Update Required
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {validationIssues.length > 0
                    ? validationIssues.map((i) => i.message).join(". ")
                    : "Your 15-minute price guarantee has expired. Retailer catalogue prices and GST calculations must be refreshed before checkout."}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleRefreshQuote}
              disabled={isRefreshingQuote}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shrink-0 h-9"
            >
              {isRefreshingQuote ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Accept & Refresh Quote
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Cart Warnings / Alerts */}
      {warnings && warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Important Cart Notices ({warnings.length})</span>
          </div>
          <ul className="list-disc list-inside space-y-1 pl-1">
            {warnings.map((warn, i) => (
              <li key={i}>{warn}</li>
            ))}
          </ul>
        </div>
      )}

      {(error || quoteError) && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error || quoteError}</span>
        </div>
      )}

      {/* Main Grid: Left Items List, Right Order Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Cart Items Grouped by Retailer */}
        <div className="lg:col-span-8 space-y-6">
          {Object.entries(itemsByRetailer).map(([retailerName, retailerItems]) => (
            <Card key={retailerName} className="border shadow-xs overflow-hidden">
              <CardHeader className="bg-muted/40 py-3 px-4 border-b flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-emerald-600" />
                  <span className="font-bold text-sm text-foreground">
                    Seller: {retailerName}
                  </span>
                </div>
                <Badge variant="secondary" className="text-[11px] font-medium">
                  {retailerItems.length}{" "}
                  {retailerItems.length === 1 ? "product" : "products"}
                </Badge>
              </CardHeader>

              <CardContent className="p-0 divide-y">
                {retailerItems.map((item) => {
                  const isBusy = isMutating && activeItemId === item.id;
                  const quoteItem = quote?.items.find(
                    (qi) => qi.listing_id === item.listing_id
                  );

                  return (
                    <div
                      key={item.id}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between"
                    >
                      {/* Product Thumbnail & Details */}
                      <div className="flex items-start gap-4 flex-1">
                        <div className="h-20 w-20 shrink-0 rounded-xl bg-muted/60 border overflow-hidden flex items-center justify-center">
                          {item.primary_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.primary_image_url}
                              alt={item.product_name}
                              className="h-full w-full object-cover object-center"
                            />
                          ) : (
                            <ShoppingBasket className="h-8 w-8 text-muted-foreground/40" />
                          )}
                        </div>

                        <div className="space-y-1">
                          <Link
                            href={`/products/${item.product_slug || item.product_id}`}
                            className="font-bold text-sm text-foreground hover:text-emerald-700 transition-colors line-clamp-1"
                          >
                            {item.product_name}
                          </Link>

                          {item.variant_name && (
                            <div className="text-xs text-muted-foreground">
                              Variant:{" "}
                              <span className="font-medium text-foreground">
                                {item.variant_name}
                              </span>
                            </div>
                          )}

                          {item.attributes &&
                            Object.keys(item.attributes).length > 0 && (
                              <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                                {Object.entries(item.attributes).map(
                                  ([k, v]) => (
                                    <span
                                      key={k}
                                      className="inline-block bg-muted px-1.5 py-0.5 rounded"
                                    >
                                      {k}: {String(v)}
                                    </span>
                                  )
                                )}
                              </div>
                            )}

                          {/* Phase 2C GST & Taxable Snapshot Breakdown per Item */}
                          {quoteItem && (
                            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-muted-foreground">
                              <span className="bg-muted/70 px-1.5 py-0.5 rounded font-mono font-medium text-foreground">
                                HSN: {quoteItem.hsn_code}
                              </span>
                              <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded font-medium">
                                {quoteItem.gst_rate_basis_points / 100}% GST
                              </span>
                              <span>
                                Taxable:{" "}
                                <strong className="text-foreground">
                                  {formatPrice(quoteItem.taxable_base_paise)}
                                </strong>
                              </span>
                              <span>
                                Tax:{" "}
                                <strong className="text-foreground">
                                  {formatPrice(quoteItem.total_tax_paise)}
                                </strong>
                              </span>
                            </div>
                          )}

                          {/* Availability / Stock Notice & Intelligent Substitutes */}
                          {!item.is_available && (
                            <div className="space-y-1.5 pt-1">
                              <div className="flex items-center gap-1 text-xs text-red-600 font-semibold">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                {item.validation_message || "Item unavailable"}
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenSubstituteModal(item)}
                                className="h-7 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200 border-amber-500/40 font-semibold cursor-pointer"
                              >
                                <Sparkles className="h-3.5 w-3.5 mr-1 text-amber-600" />
                                Find Suitable Substitutes
                              </Button>
                            </div>
                          )}
                          {item.is_available && (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {item.available_stock <= 5 && (
                                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                  Only {item.available_stock} left
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenSubstituteModal(item)}
                                className="text-[11px] text-muted-foreground hover:text-emerald-700 dark:hover:text-emerald-400 flex items-center gap-1 font-medium transition-colors cursor-pointer"
                              >
                                <Sparkles className="h-3 w-3 text-amber-500" />
                                Explore Alternatives
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Quantity Controls & Line Subtotal */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3 pt-2 sm:pt-0 border-t sm:border-0">
                        {/* Unit & Subtotal Price */}
                        <div className="text-left sm:text-right">
                          <div className="text-base font-extrabold text-foreground">
                            {formatPrice(
                              quoteItem
                                ? quoteItem.total_selling_price_paise
                                : item.subtotal_paise
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatPrice(
                              quoteItem
                                ? quoteItem.unit_selling_price_paise
                                : item.unit_price_paise
                            )}{" "}
                            each (incl. GST)
                          </div>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center border rounded-lg bg-background overflow-hidden h-8">
                            <button
                              type="button"
                              onClick={() =>
                                handleQuantityChange(item.id, item.quantity - 1)
                              }
                              disabled={item.quantity <= 1 || isBusy}
                              aria-label="Decrease quantity"
                              className="px-2.5 h-full hover:bg-muted font-bold disabled:opacity-40 transition-colors"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="px-2 text-xs font-semibold min-w-6 text-center">
                              {isBusy ? (
                                <Loader2 className="h-3 w-3 animate-spin mx-auto" />
                              ) : (
                                item.quantity
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleQuantityChange(item.id, item.quantity + 1)
                              }
                              disabled={
                                item.quantity >= 10 ||
                                item.quantity >= item.available_stock ||
                                isBusy
                              }
                              aria-label="Increase quantity"
                              className="px-2.5 h-full hover:bg-muted font-bold disabled:opacity-40 transition-colors"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemove(item.id)}
                            disabled={isBusy}
                            title="Remove item"
                            aria-label={`Remove ${item.product_name}`}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Right Column: Order Summary & Retailer Delivery Breakdown */}
        <div className="lg:col-span-4 space-y-4">
          {/* AI Negotiator (Phase 3D) */}
          {isAuthenticated && <NegotiatorPanel />}
          <Card className="border shadow-xs">
            <CardHeader className="pb-3 border-b bg-muted/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-emerald-600" />
                  {t("cart.orderSummary")}
                </CardTitle>
                {isQuoteLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : timeRemaining !== null && timeRemaining > 0 && !isQuoteStale ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <Clock className="h-3 w-3" />
                    {t("cart.lockedFor", { time: formatCountdown(timeRemaining) })}
                  </span>
                ) : isQuoteStale ? (
                  <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-500/20">
                    {t("cart.quoteExpiredTitle")}
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {/* Line item tallies */}
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>{t("cart.itemCount", { n: itemCount })}</span>
                  <span className="font-medium text-foreground">
                    {totalQuantity} units
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t("cart.subtotal")}</span>
                  <span className="font-semibold text-foreground">
                    {formatPrice(quote ? quote.subtotal_paise : subtotalPaise)}
                  </span>
                </div>

                <div className="space-y-1" aria-label="Coupon">
                  <div className="flex gap-2">
                    <input
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyCoupon();
                      }}
                      placeholder="Coupon code"
                      aria-label="Coupon code"
                      maxLength={50}
                      className="h-8 min-w-0 flex-1 rounded border px-2 text-xs uppercase"
                    />
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={!couponInput.trim() || couponStatus === "applying"} onClick={applyCoupon}>
                      {couponCode && couponInput.trim() !== couponCode ? "Replace" : "Apply"}
                    </Button>
                    {couponCode && (
                      <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={removeCoupon}>
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-xs" role="status" aria-live="polite">
                    {couponStatus === "applying" && <span className="text-muted-foreground">Checking coupon…</span>}
                    {couponStatus === "applied" && <span className="text-emerald-700">Coupon {couponCode.toUpperCase()} applied — included in the discounts below.</span>}
                    {couponStatus === "ineligible" && <span className="text-amber-700">Coupon {couponCode.toUpperCase()} is valid but does not apply to this basket (for example a minimum order value or a store/product it is limited to).</span>}
                    {couponStatus === "invalid" && rejectedCode && <span className="text-red-600">Coupon {rejectedCode.toUpperCase()} is not valid or has expired.</span>}
                  </p>
                </div>

                {quote && quote.discount_total_paise > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Active Promotional Discounts</span>
                    <span>-{formatPrice(quote.discount_total_paise)}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="flex items-center gap-1">
                    <Truck className="h-3 w-3" />
                    {t("cart.deliveryCharges")}
                  </span>
                  <span
                    className={
                      (quote ? quote.delivery_fee_paise : 0) === 0
                        ? "text-emerald-700 dark:text-emerald-400 font-bold"
                        : "font-semibold text-foreground"
                    }
                  >
                    {quote
                      ? quote.delivery_fee_paise === 0
                        ? t("cart.freeDelivery")
                        : formatPrice(quote.delivery_fee_paise)
                      : "Calculating..."}
                  </span>
                </div>
              </div>

              {/* Retailer Delivery Breakdown with Free Delivery Threshold Progress */}
              {quote && quote.retailer_breakdowns && quote.retailer_breakdowns.length > 0 && (
                <div className="pt-3 border-t space-y-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                    <span>Retailer Delivery Rules</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      Free above ₹499/seller
                    </span>
                  </div>
                  <div className="space-y-2">
                    {quote.retailer_breakdowns.map((ret) => (
                      <div
                        key={ret.retailer_id}
                        className="bg-muted/40 p-2.5 rounded-lg space-y-1.5 text-xs"
                      >
                        <div className="flex justify-between items-baseline">
                          <span className="font-semibold text-foreground truncate max-w-[170px]">
                            {ret.retailer_name} ({ret.retailer_state})
                          </span>
                          <span className="font-bold text-foreground">
                            {ret.qualifies_for_free_delivery ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                Free Delivery
                              </span>
                            ) : (
                              formatPrice(ret.delivery_fee_paise)
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Seller Subtotal</span>
                          <span>{formatPrice(ret.subtotal_paise)}</span>
                        </div>
                        {!ret.qualifies_for_free_delivery &&
                          ret.amount_needed_for_free_delivery_paise > 0 && (
                            <div className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                              Add {formatPrice(ret.amount_needed_for_free_delivery_paise)} more from {ret.retailer_name} for FREE delivery
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* GST Tax Breakdown Section (Deterministic Intra/Inter-state) */}
              {quote && (
                <div className="pt-3 border-t space-y-2 text-xs">
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      Included Indian GST
                    </span>
                    <span className="font-bold text-foreground">
                      {formatPrice(quote.total_tax_paise)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 bg-muted/30 p-2 rounded-lg text-center text-[10px] text-muted-foreground">
                    <div>
                      <div className="font-bold text-foreground">
                        {formatPrice(quote.cgst_paise)}
                      </div>
                      <div>CGST</div>
                    </div>
                    <div>
                      <div className="font-bold text-foreground">
                        {formatPrice(quote.sgst_paise)}
                      </div>
                      <div>SGST</div>
                    </div>
                    <div>
                      <div className="font-bold text-foreground">
                        {formatPrice(quote.igst_paise)}
                      </div>
                      <div>IGST</div>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    GST is calculated strictly at statutory HSN rates. CGST + SGST apply for intra-state delivery; IGST applies for inter-state delivery.
                  </p>
                </div>
              )}

              {/* Grand Total Payable */}
              <div className="pt-3 border-t flex justify-between items-baseline">
                <div>
                  <span className="text-sm font-bold text-foreground block">
                    {t("cart.totalPayable")}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {t("cart.totalPayableSubtitle")}
                  </span>
                </div>
                <span className="text-2xl font-extrabold text-foreground">
                  {formatPrice(
                    quote
                      ? quote.total_payable_paise
                      : subtotalPaise
                  )}
                </span>
              </div>

              {/* Reservation & Checkout Section (Phase 2D Concurrency Protection) */}
              <div className="space-y-2 pt-2">
                {reservation && reservation.status === "ACTIVE" ? (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-emerald-600 text-white flex items-center gap-1 text-[11px]">
                        <ShieldCheck className="h-3 w-3" />
                        {t("cart.stockGuaranteed")}
                      </Badge>
                      {reservationTimeRemaining !== null && (
                        <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {Math.floor(reservationTimeRemaining / 60)}:
                          {(reservationTimeRemaining % 60).toString().padStart(2, "0")}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                      {t("cart.stockGuaranteedBody")}
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 text-muted-foreground hover:text-destructive px-2"
                        onClick={handleReleaseReservation}
                        disabled={isReleasing}
                      >
                        {isReleasing ? "Releasing..." : "Release Hold"}
                      </Button>
                      <Link href={`/checkout?reservation_id=${reservation.id}&quote_id=${reservation.quote_id}`}>
                        <Button
                          size="sm"
                          className="bg-brand-yellow hover:bg-brand-yellow-dark text-ink font-semibold text-xs h-8 px-3"
                        >
                          {t("cart.proceed")}
                          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <Button
                    className="w-full bg-brand-yellow hover:bg-brand-yellow-dark text-ink font-semibold h-11 text-sm shadow-sm"
                    disabled={
                      items.some((i) => !i.is_available) ||
                      isQuoteStale ||
                      isQuoteLoading ||
                      isRefreshingQuote ||
                      isReserving
                    }
                    onClick={handleCreateReservation}
                  >
                    {isReserving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Acquiring Row Locks...
                      </>
                    ) : (
                      <>
                        {t("cart.checkout")}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                )}

                {reservationError && (
                  <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-semibold">Inventory Unavailable</p>
                      <p className="text-[11px]">{reservationError}</p>
                    </div>
                  </div>
                )}

                {reservation?.status === "EXPIRED" && (
                  <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
                    <span>Reservation expired. Click to re-reserve stock.</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 text-amber-900 border-amber-300"
                      onClick={handleCreateReservation}
                    >
                      Re-reserve
                    </Button>
                  </div>
                )}

                {isQuoteStale && (
                  <p className="text-[11px] text-center text-amber-600 font-medium">
                    Please refresh your quote before proceeding to checkout.
                  </p>
                )}

                {items.some((i) => !i.is_available) && (
                  <p className="text-[11px] text-center text-red-600">
                    Please remove or update unavailable items before checkout.
                  </p>
                )}
              </div>

              {/* Server-Authoritative Guarantees */}
              <div className="pt-3 border-t space-y-1 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Prices confirmed by BASKET and fixed for this checkout</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Zero frontend-trusted price or tax calculations</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Statutory Indian GST reconciliation guaranteed</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Intelligent Substitute Modal (Phase 2B) */}
      <SubstituteModal
        isOpen={isSubstituteModalOpen}
        onClose={() => setIsSubstituteModalOpen(false)}
        cartItem={substituteItem}
        onReplaced={handleSubstituteReplaced}
      />
    </div>
  );
}


export default function CartPage() {
  return (
    <ShopperGuard>
      <CartPageInner />
    </ShopperGuard>
  );
}
