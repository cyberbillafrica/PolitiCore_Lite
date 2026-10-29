import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { MaintenanceGuard } from "@/components/providers/MaintenanceGuard";
import { ConfirmProvider } from "@/components/ui/confirm";
import ContextualHelp from "@/components/help/ContextualHelp";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import IosInstallHint from "@/components/pwa/IosInstallHint";
import { BRANDING } from "@/config/branding";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${BRANDING.shortName} — ${BRANDING.tagline}`,
  description: `${BRANDING.shortName} — Centralizing political organization, field operations, stakeholder coordination, and campaign intelligence into one coherent platform.`,
  applicationName: BRANDING.appName,

  /* iOS home-screen install: standalone chrome + app title. */
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: BRANDING.shortName,
  },

  /*
   * Next 16 renders `capable: true` as the standard mobile-web-app-capable
   * meta. iOS releases before 16.4 only honour the Apple-prefixed name, so
   * both are emitted.
   */
  other: {
    "apple-mobile-web-app-capable": "yes",
  },

  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

/*
 * Next 16 moved themeColor out of `metadata` into `viewport`. It is
 * the build-time BRANDING seed; a Firestore site_settings override
 * cannot reach the installed app's manifest or browser chrome.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: BRANDING.primaryColor,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="max-w-full overflow-x-hidden">
      <body
        className={`${inter.className} max-w-full overflow-x-hidden antialiased bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200`}
      >
        <AuthProvider>
          <ThemeProvider>
            <ConfirmProvider>
              <MaintenanceGuard>{children}</MaintenanceGuard>

              {/* Floating help — every page, public and portal alike. */}
              <ContextualHelp />

              {/*
                Install offers. Both self-gate: Android/Chromium only
                shows the banner after beforeinstallprompt, iOS Safari
                only shows the share-sheet hint, and neither renders
                once the app is installed.
              */}
              <InstallPrompt />
              <IosInstallHint />

              {/*
                App-wide Sonner toaster. Bottom-right on desktop, most
                of the viewport width on mobile. Durations/colors are
                applied per-call by src/lib/notify.ts.
              */}
              <Toaster
                position="bottom-right"
                closeButton
                visibleToasts={3}
                richColors
                toastOptions={{
                  classNames: {
                    toast: "group rounded-xl border shadow-lg text-sm font-medium",
                  },
                }}
              />
            </ConfirmProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
