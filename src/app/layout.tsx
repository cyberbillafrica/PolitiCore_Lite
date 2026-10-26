import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { MaintenanceGuard } from "@/components/providers/MaintenanceGuard";
import { ConfirmProvider } from "@/components/ui/confirm";
import ContextualHelp from "@/components/help/ContextualHelp";
import { BRANDING } from "@/config/branding";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${BRANDING.shortName} — ${BRANDING.tagline}`,
  description: `${BRANDING.shortName} — Centralizing political organization, field operations, stakeholder coordination, and campaign intelligence into one coherent platform.`,
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
