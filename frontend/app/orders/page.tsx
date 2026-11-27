"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Package,
  Search,
  Filter,
  ArrowRight,
  Truck,
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  KeyRound,
  Loader2,
  Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/auth-context";
import { apiClient } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/i18n-context";
import type { OrderListItem, OrderStatus } from "@/types/index";
import { useLiveUpdates } from "@/lib/realtime";

function formatPrice(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}

function getStatusBadge(status: OrderStatus) {
  switch (status) {
    case "DELIVERED":
      return <Badge className="bg-brand-yellow text-ink hover:bg-brand-yellow-dark">Delivered</Badge>;
    case "SHIPPED":
      return <Badge className="bg-blue-600 text-white hover:bg-blue-700">Shipped</Badge>;
    case "OUT_FOR_DELIVERY":
      return <Badge className="bg-indigo-600 text-white hover:bg-indigo-700">Out for Delivery</Badge>;
    case "PACKED":
    case "PROCESSING":
      return <Badge className="bg-amber-600 text-white hover:bg-amber-700">{status}</Badge>;
    case "CONFIRMED":
      return <Badge className="bg-teal-600 text-white hover:bg-teal-700">Confirmed</Badge>;
    case "PENDING_PAYMENT":
      return <Badge variant="outline" className="text-amber-600 border-amber-500">Payment Pending</Badge>;
    case "CANCELLED":
      return <Badge variant="destructive">Cancelled</Badge>;
    case "RETURNED":
      return <Badge className="bg-purple-600 text-white hover:bg-purple-700">Returned</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function OrdersPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { t } = useI18n();

  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [page, setPage] = useState(0);
  const limit = 10;

  // Guest lookup state
  const [guestOrderNumber, setGuestOrderNumber] = useState("");
  const [guestAccessToken, setGuestAccessToken] = useState("");
  const [guestLookupLoading, setGuestLookupLoading] = useState(false);
  const [guestLookupError, setGuestLookupError] = useState<string | null>(null);

  const fetchOrders = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listOrders(
        limit,
        page * limit,
        statusFilter || undefined,
        searchQuery.trim() || undefined,
        fromDate ? new Date(fromDate).toISOString() : undefined,
        toDate ? new Date(toDate).toISOString() : undefined,
      );
      setOrders(res.items || res.orders || []);
      setTotal(res.total || 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load orders.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [limit, page, statusFilter, searchQuery, fromDate, toDate]);
  useLiveUpdates(["order.", "payment.", "fulfilment."], () => void fetchOrders({ quiet: true }), { enabled: isAuthenticated });

  useEffect(() => {
    if (!authLoading) {
      if (isAuthenticated) {
        fetchOrders();
      } else {
        setLoading(false);
        setOrders([]);
      }
    }
  }, [authLoading, isAuthenticated, fetchOrders]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchOrders();
  };

  const handleGuestLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestOrderNumber.trim() || !guestAccessToken.trim()) {
      setGuestLookupError("Please enter both your Order Number and Access Token.");
      return;
    }
    setGuestLookupLoading(true);
    setGuestLookupError(null);
    try {
      const foundOrder = await apiClient.guestLookupOrder(
        guestOrderNumber.trim(),
        guestAccessToken.trim(),
      );
      router.push(
        `/orders/${foundOrder.id}?access_token=${encodeURIComponent(
          guestAccessToken.trim(),
        )}`,
      );
    } catch {
      setGuestLookupError(
        "No matching order found. Please verify your order number and access token.",
      );
    } finally {
      setGuestLookupLoading(false);
    }
  };

  const clearFilters = () => {
    setStatusFilter("");
    setSearchQuery("");
    setFromDate("");
    setToDate("");
    setPage(0);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Page Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Package className="h-6 w-6 text-emerald-600" />
            {t("orders.title")}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {t("orders.subtitle")}
          </p>
        </div>

        {isAuthenticated && (
          <Link href="/products">
            <Button size="sm" className="bg-brand-yellow hover:bg-brand-yellow-dark text-ink text-xs gap-1.5 shadow-xs">
              {t("orders.continueShopping")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        )}
      </div>

      {/* Guest Order Lookup Card */}
      <Card className="mb-6 border-dashed border-muted-foreground/30 bg-muted/20">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <KeyRound className="h-4 w-4 text-emerald-600" />
            Guest Order Lookup
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <p className="text-xs text-muted-foreground mb-3">
            Placed an order without an account? Enter your order number and the secure access token from your confirmation screen.
          </p>
          <form onSubmit={handleGuestLookup} className="flex flex-col sm:flex-row gap-2.5 items-start sm:items-center">
            <Input
              type="text"
              placeholder="Order Number (e.g. BSK-20261119-...)"
              value={guestOrderNumber}
              onChange={(e) => setGuestOrderNumber(e.target.value)}
              className="h-9 text-xs sm:max-w-xs bg-background"
            />
            <Input
              type="text"
              placeholder="Secure Access Token"
              value={guestAccessToken}
              onChange={(e) => setGuestAccessToken(e.target.value)}
              className="h-9 text-xs sm:max-w-xs bg-background font-mono"
            />
            <Button
              type="submit"
              size="sm"
              disabled={guestLookupLoading}
              className="h-9 text-xs bg-brand-yellow hover:bg-brand-yellow-dark text-ink shrink-0"
            >
              {guestLookupLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Finding Order...
                </>
              ) : (
                "Lookup Order"
              )}
            </Button>
          </form>
          {guestLookupError && (
            <p className="text-xs text-red-600 mt-2 font-medium">{guestLookupError}</p>
          )}
        </CardContent>
      </Card>

      {/* Search & Filters Toolbar */}
      <div className="bg-card border rounded-xl p-4 mb-6 shadow-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("orders.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
              className="h-9 text-xs px-3 rounded-md border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">{t("orders.allStatuses")}</option>
              <option value="CONFIRMED">{t("orders.statusConfirmed")}</option>
              <option value="PROCESSING">{t("orders.statusProcessing")}</option>
              <option value="PACKED">{t("orders.statusProcessing")}</option>
              <option value="SHIPPED">{t("orders.statusShipped")}</option>
              <option value="OUT_FOR_DELIVERY">{t("orders.statusOutForDelivery")}</option>
              <option value="DELIVERED">{t("orders.statusDelivered")}</option>
              <option value="CANCELLED">{t("orders.statusCancelled")}</option>
              <option value="RETURNED">{t("orders.statusReturned")}</option>
              <option value="PENDING_PAYMENT">{t("orders.statusPending")}</option>
            </select>

            <Input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(0);
              }}
              title="From date"
              className="h-9 text-xs w-36"
            />
            <Input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(0);
              }}
              title="To date"
              className="h-9 text-xs w-36"
            />

            {(statusFilter || searchQuery || fromDate || toDate) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </Button>
            )}

            <Button type="submit" size="sm" className="h-9 text-xs bg-brand-yellow hover:bg-brand-yellow-dark text-ink">
              <Filter className="h-3.5 w-3.5 mr-1" />
              Apply
            </Button>
          </div>
        </form>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mb-3" />
          <p className="text-xs">Loading order history...</p>
        </div>
      ) : error ? (
        <div className="p-8 text-center rounded-xl border border-red-200 bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-300">
          <p className="text-sm font-semibold">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void fetchOrders()} className="mt-3 text-xs">
            Try Again
          </Button>
        </div>
      ) : orders.length === 0 ? (
        <Card className="text-center py-12 px-4">
          <CardContent className="space-y-3">
            <Package className="h-12 w-12 text-muted-foreground mx-auto stroke-1" />
            <h3 className="text-base font-semibold text-foreground">
              {!isAuthenticated ? "Sign in to view your orders" : t("orders.emptyTitle")}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {!isAuthenticated
                ? "Sign in to access your complete purchase history, or enter your Order Number and Access Token above to look up an order placed as a guest."
                : statusFilter || searchQuery || fromDate || toDate
                ? "No orders match your filter criteria. Try clearing filters to see all purchases."
                : t("orders.emptySubtitle")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {!isAuthenticated ? (
                <>
                  <Link href="/login?redirect=/orders">
                    <Button size="sm" className="bg-brand-yellow hover:bg-brand-yellow-dark text-ink text-xs">
                      Sign In to Account
                    </Button>
                  </Link>
                  <Link href="/products">
                    <Button size="sm" variant="outline" className="text-xs">
                      {t("orders.startShopping")}
                    </Button>
                  </Link>
                </>
              ) : (
                <Link href="/products">
                  <Button size="sm" className="bg-brand-yellow hover:bg-brand-yellow-dark text-ink text-xs">
                    {t("orders.startShopping")}
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <Card key={o.id} className="hover:shadow-md transition-shadow border-muted/80">
              <CardContent className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-foreground">
                      {o.order_number}
                    </span>
                    {getStatusBadge(o.status)}
                    <Badge variant="outline" className="text-[10px] font-mono">
                      Payment: {o.payment_status}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(o.created_at).toLocaleDateString("en-IN", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span>•</span>
                    <span>
                      {o.item_count} {o.item_count === 1 ? "item" : "items"}
                    </span>
                    <span>•</span>
                    <span className="font-semibold text-foreground text-sm">
                      {formatPrice(o.total_payable_paise)}
                    </span>
                  </div>

                  {o.cancellation_reason && (
                    <p className="text-xs text-red-600 font-medium">
                      Cancelled: {o.cancellation_reason}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-muted">
                  <Link href={`/orders/${o.id}`}>
                    <Button variant="outline" size="sm" className="text-xs h-9">
                      {t("orders.viewDetails")}
                    </Button>
                  </Link>

                  <Link href={`/orders/${o.id}/track`}>
                    <Button
                      size="sm"
                      className="bg-brand-yellow hover:bg-brand-yellow-dark text-ink text-xs h-9 gap-1.5 shadow-xs"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      {t("orders.track")}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-between pt-4 text-xs text-muted-foreground">
              <span>
                Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total} orders
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="h-8 text-xs"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(page + 1) * limit >= total}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-8 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
