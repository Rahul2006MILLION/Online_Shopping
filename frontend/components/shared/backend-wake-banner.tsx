"use client";

import { useEffect, useState } from "react";
import { BACKEND_READY_EVENT, BACKEND_WAKING_EVENT } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/i18n-context";

/**
 * Shown while reads are waiting for a sleeping backend to start (hosted demo on
 * a free plan). Requests keep retrying in the background; the banner disappears
 * as soon as the last one completes.
 */
export function BackendWakeBanner() {
  const { t } = useI18n();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const onWaking = () => setPending((n) => n + 1);
    const onReady = () => setPending((n) => Math.max(0, n - 1));
    window.addEventListener(BACKEND_WAKING_EVENT, onWaking);
    window.addEventListener(BACKEND_READY_EVENT, onReady);
    return () => {
      window.removeEventListener(BACKEND_WAKING_EVENT, onWaking);
      window.removeEventListener(BACKEND_READY_EVENT, onReady);
    };
  }, []);

  if (pending === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4"
    >
      <div className="flex max-w-md items-center gap-3 rounded-full bg-ink px-5 py-3 text-sm text-white shadow-[0_12px_30px_-12px_rgba(8,8,8,0.6)]">
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-yellow opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-yellow" />
        </span>
        <span>{t("system.backendWaking")}</span>
      </div>
    </div>
  );
}
