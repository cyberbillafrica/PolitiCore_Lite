"use client";

import { RefreshCw } from "lucide-react";

/** The only interactive part of the static offline page. */
export default function OfflineRetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
    >
      <RefreshCw className="h-4 w-4" />
      Retry
    </button>
  );
}
