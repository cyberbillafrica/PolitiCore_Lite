import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { MaintenanceGuard } from "@/components/providers/MaintenanceGuard";
import { ToastProvider } from "@/components/providers/ToastProvider";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PolitiCore — Political Operations & Campaign Intelligence Platform",
  description: "PolitiCore — Centralizing political organization, field operations, stakeholder coordination, and campaign intelligence into one coherent platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="max-w-full overflow-x-hidden">
      <body className={`${inter.className} max-w-full overflow-x-hidden antialiased bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-200`}>
        <AuthProvider>
          <ThemeProvider>
            <MaintenanceGuard>{children}</MaintenanceGuard>
            <ToastProvider />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
