"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, User, Bell, LogOut, ArrowUpRight, Sun, Moon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/components/providers/ThemeProvider";
import { logOut } from "@/lib/firebase/auth";
import { getSiteSettings, SiteSettings, DEFAULT_SITE_SETTINGS } from "@/lib/firebase/site-settings";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    getSiteSettings().then(setSettings).catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logOut();
    setIsOpen(false);
  };

  const closeMenu = () => setIsOpen(false);

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-[0_2px_20px_rgba(0,0,0,0.06)] transition-colors duration-200">
      {/* Accent Line */}
      <div className="flex h-1 w-full">
        <div className="w-1/3 bg-[#008751]" />
        <div className="w-1/3 bg-white dark:bg-gray-800" />
        <div className="w-1/3 bg-[#008751]" />
      </div>

      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-[76px] items-center justify-between">
          {/* Brand */}
          <div className="shrink-0">
            <Link href="/" onClick={closeMenu} className="group flex items-center gap-3">
              {settings.logoUrl ? (
                <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white p-1 shadow-sm">
                  <img src={settings.logoUrl} alt={settings.brandName} className="h-full w-full object-contain" />
                </div>
              ) : (
                <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-emerald-200 bg-emerald-700 text-white font-extrabold shadow-sm transition-all duration-300 group-hover:shadow-md">
                  DCM
                </div>
              )}

              <div className="leading-none">
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-extrabold tracking-tight text-[#008751] sm:text-xl">
                    {settings.brandName.split(" ")[0]}
                  </span>
                  <span className="text-lg font-extrabold text-gray-800 dark:text-gray-100 sm:text-xl">
                    {settings.brandName.split(" ").slice(1).join(" ")}
                  </span>
                </div>

                <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400 sm:text-[11px]">
                  {settings.brandTagline}
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Nav */}
          <div className="hidden items-center gap-7 md:flex">
            <Link href="/" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-[#008751] dark:hover:text-emerald-400">
              Home
            </Link>
            <Link href="/about" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-[#008751] dark:hover:text-emerald-400">
              About Us
            </Link>
            <Link href="/structure" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-[#008751] dark:hover:text-emerald-400">
              Our Structure
            </Link>
            <Link href="/news" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-[#008751] dark:hover:text-emerald-400">
              News
            </Link>
            <Link href="/gallery" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-[#008751] dark:hover:text-emerald-400">
              Gallery
            </Link>
            <Link href="/contact" className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-[#008751] dark:hover:text-emerald-400">
              Contact
            </Link>
          </div>

          {/* Actions */}
          <div className="hidden items-center gap-3 md:flex">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              title={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
              className="p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {theme === "dark" ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5 text-indigo-600" />}
            </button>

            {user ? (
              <>
                <Link
                  href="/portal/dashboard"
                  className="flex items-center gap-2 rounded-full bg-[#008751] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#007744]"
                >
                  <User className="h-4 w-4" />
                  <span>Portal</span>
                </Link>
                <button
                  onClick={handleLogout}
                  aria-label="Logout"
                  className="rounded-full p-2 text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm font-semibold text-[#008751] dark:text-emerald-400 hover:text-[#006b40]">
                  Log In
                </Link>
                <Link
                  href="/volunteer"
                  className="group flex items-center gap-2 rounded-full bg-[#008751] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#007744]"
                >
                  Get Involved
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {theme === "dark" ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5 text-indigo-600" />}
            </button>

            <button
              onClick={() => setIsOpen(!isOpen)}
              className="rounded-xl p-2 text-gray-600 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-gray-800 hover:text-[#008751]"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="border-t border-gray-100 dark:border-gray-800 pb-5 pt-3 md:hidden">
            <div className="flex flex-col gap-1">
              {[
                ["Home", "/"],
                ["About Us", "/about"],
                ["Our Structure", "/structure"],
                ["News", "/news"],
                ["Gallery", "/gallery"],
                ["Contact", "/contact"],
              ].map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  onClick={closeMenu}
                  className="group flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-green-50 dark:hover:bg-gray-800 hover:text-[#008751]"
                >
                  <span>{label}</span>
                  <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-[#008751]" />
                </Link>
              ))}

              <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-4">
                {user ? (
                  <div className="space-y-2">
                    <Link
                      href="/portal/dashboard"
                      onClick={closeMenu}
                      className="flex items-center justify-center gap-2 rounded-xl bg-[#008751] px-4 py-3 text-sm font-bold text-white"
                    >
                      <User className="h-4 w-4" /> Member Portal
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <LogOut className="h-4 w-4" /> Logout
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Link
                      href="/login"
                      onClick={closeMenu}
                      className="block rounded-xl border border-[#008751]/20 px-4 py-3 text-center text-sm font-semibold text-[#008751] dark:text-emerald-400"
                    >
                      Sign In
                    </Link>
                    <Link
                      href="/volunteer"
                      onClick={closeMenu}
                      className="flex items-center justify-center gap-2 rounded-xl bg-[#008751] px-4 py-3 text-sm font-bold text-white"
                    >
                      Get Involved <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
