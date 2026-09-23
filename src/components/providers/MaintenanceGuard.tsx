"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { getSiteSettings, SiteSettings, DEFAULT_SITE_SETTINGS } from "@/lib/firebase/site-settings";
import { Wrench } from "lucide-react";

export function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    getSiteSettings()
      .then((data) => {
        setSettings(data);
      })
      .catch((err) => {
        console.error("Failed to load site settings for maintenance check:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [pathname]);

  // Bypass routes that must always remain accessible to administrators & auth/API systems
  const isBypassed =
    pathname.startsWith("/portal") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".");

  if (!loading && settings.maintenanceMode && !isBypassed) {
    if (settings.maintenanceScreen === "dark_blue") {
      // Option 2: Dark Blue Screen Experience
      return (
        <div className="fixed inset-0 z-[9999] bg-[#0A192F] w-screen h-screen overflow-hidden flex items-center justify-center select-none">
          <div className="w-2 h-2 rounded-full bg-blue-500/20" />
        </div>
      );
    }

    // Option 1: Polished Maintenance Page Experience
    return (
      <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden select-none">
        {/* Subtle Background Glow Accent */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-lg w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-8 sm:p-10 text-center shadow-2xl backdrop-blur-md space-y-6">
          {/* Logo */}
          <div className="flex justify-center">
            {settings.logoUrl ? (
              <div className="relative h-16 w-16 rounded-2xl bg-slate-800 border border-slate-700 p-2 flex items-center justify-center shadow-md">
                <Image src={settings.logoUrl} alt={settings.brandName || "Brand Logo"} fill className="object-contain p-2" />
              </div>
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-emerald-700 text-white font-black flex items-center justify-center text-2xl shadow-lg">
                PC
              </div>
            )}
          </div>

          {/* App Name & Maintenance Icon */}
          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 text-xs font-bold tracking-wide uppercase">
              <Wrench className="h-3.5 w-3.5 animate-pulse" /> Maintenance Mode Active
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              {settings.brandName || "POLITICORE"}
            </h1>
          </div>

          {/* Messages */}
          <div className="space-y-3 pt-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-200">
              We&apos;re currently performing scheduled maintenance
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
              We&apos;ll be back online soon. Thank you for your patience while we improve your experience.
            </p>
          </div>

          {/* Subtitle / Copyright Footer */}
          <div className="pt-6 border-t border-slate-800/80 text-xs text-slate-500 font-medium">
            {settings.brandTagline || "POLITICAL OPERATIONS PLATFORM"}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
