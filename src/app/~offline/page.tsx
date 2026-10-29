import { WifiOff } from "lucide-react";

import { BRANDING } from "@/config/branding";
import OfflineRetryButton from "@/components/pwa/OfflineRetryButton";

/*
 * Offline fallback.
 *
 * Serwist serves this document when a navigation fails and the network
 * is gone. It must stay static and must not read Firestore or wait on
 * auth — it is rendered from the service worker cache with no network
 * available.
 */
export const dynamic = "force-static";

export const metadata = {
  title: `Offline — ${BRANDING.shortName}`,
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-8 text-center shadow-2xl sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-700 text-2xl font-black text-white shadow-lg">
          {BRANDING.monogram}
        </div>

        <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-amber-800/60 bg-amber-950/50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-300">
          <WifiOff className="h-3.5 w-3.5" />
          Offline
        </span>

        <h1 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl">
          You&apos;re offline
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          {BRANDING.shortName} can&apos;t reach the network right now. Check
          your connection and try again — nothing has been lost.
        </p>

        <OfflineRetryButton />

        <p className="mt-7 border-t border-slate-800 pt-5 text-xs font-medium text-slate-500">
          {BRANDING.shortName} — {BRANDING.tagline}
        </p>
      </div>
    </main>
  );
}
