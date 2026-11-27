"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { initiatePayment, verifyPayment } from "@/lib/api/payments";
import {
  keyForOrder,
  shouldRotatePaymentKey,
  type PaymentKeyState,
} from "@/lib/payments/idempotency";
import type {
  PaymentVerifyResponse,
  RazorpayCheckoutOptions,
  RazorpayPaymentSuccessResponse,
} from "@/types";

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => {
      open: () => void;
      on: (event: string, callback: (response: unknown) => void) => void;
    };
  }
}

interface RazorpayPaymentButtonProps {
  orderId: string;
  amountPaise: number;
  currency?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  disabled?: boolean;
  className?: string;
  onSuccess: (result: PaymentVerifyResponse) => void;
  onError: (error: Error) => void;
  onDismissOrAmbiguous?: () => void;
}

export function RazorpayPaymentButton({
  orderId,
  amountPaise,
  currency = "INR",
  customerName,
  customerEmail,
  customerPhone,
  disabled = false,
  className,
  onSuccess,
  onError,
  onDismissOrAmbiguous,
}: RazorpayPaymentButtonProps) {
  const [loading, setLoading] = React.useState(false);
  // One Idempotency-Key per order while this page is open: retries replay the
  // same Razorpay order instead of creating a new one.
  const paymentKeyRef = React.useRef<PaymentKeyState | null>(null);

  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined") {
        resolve(false);
        return;
      }
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(true));
        existing.addEventListener("error", () => resolve(false));
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayment = async () => {
    try {
      setLoading(true);

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        throw new Error("Unable to load Razorpay checkout script. Please check your network connection.");
      }

      // Step 1: Initiate payment on backend (persists CREATING attempt, calls Razorpay)
      paymentKeyRef.current = keyForOrder(paymentKeyRef.current, orderId);
      let initData;
      try {
        initData = await initiatePayment(orderId, paymentKeyRef.current.key);
      } catch (initErr) {
        if (!shouldRotatePaymentKey(initErr)) {
          throw initErr;
        }
        // The previous attempt for this key failed permanently: start a new one.
        paymentKeyRef.current = keyForOrder(null, orderId);
        initData = await initiatePayment(orderId, paymentKeyRef.current.key);
      }

      // Step 2: Open Razorpay modal
      const options: RazorpayCheckoutOptions = {
        key: initData.razorpay_key_id,
        amount: initData.amount_paise,
        currency: initData.currency,
        name: "BASKET",
        description: `Order Payment for ${orderId}`,
        order_id: initData.provider_order_id,
        prefill: {
          name: customerName,
          email: customerEmail,
          contact: customerPhone,
        },
        theme: {
          color: "#0F172A",
        },
        handler: async (response: RazorpayPaymentSuccessResponse) => {
          try {
            // Step 3: Verify payment signature and capture server-side
            const verifyResult = await verifyPayment(orderId, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            onSuccess(verifyResult);
          } catch (verifyErr) {
            onError(
              verifyErr instanceof Error
                ? verifyErr
                : new Error("Payment verification failed")
            );
            if (onDismissOrAmbiguous) {
              onDismissOrAmbiguous();
            }
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
            if (onDismissOrAmbiguous) {
              onDismissOrAmbiguous();
            }
          },
        },
      };

      const rzp = new window.Razorpay(options);
      // A declined or failed attempt keeps the Razorpay modal open so the customer
      // can retry with another method; surface the reason on the page meanwhile.
      // The order stays unpaid: only server-side verification (or the signed
      // webhook) can mark it paid.
      rzp.on("payment.failed", (response: unknown) => {
        const description =
          (response as { error?: { description?: string } } | null)?.error?.description;
        onError(
          new Error(
            description
              ? `Payment failed: ${description}. You can retry or choose another method.`
              : "Payment failed. You can retry or choose another method."
          )
        );
      });
      rzp.open();
    } catch (err) {
      setLoading(false);
      onError(err instanceof Error ? err : new Error("Payment initiation failed"));
    }
  };

  const formattedAmount = (amountPaise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: currency.toUpperCase(),
  });

  return (
    <Button
      type="button"
      onClick={handlePayment}
      disabled={disabled || loading}
      className={className}
    >
      {loading ? "Processing..." : `Pay ${formattedAmount}`}
    </Button>
  );
}
