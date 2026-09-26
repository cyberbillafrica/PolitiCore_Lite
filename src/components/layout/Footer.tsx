"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, Phone, MapPin, ArrowUpRight, Heart } from "lucide-react";
import { getSiteSettings, SiteSettings, DEFAULT_SITE_SETTINGS } from "@/lib/firebase/site-settings";

export default function Footer() {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);

  useEffect(() => {
    getSiteSettings().then(setSettings).catch(() => {});
  }, []);

  return (
    <footer className="relative overflow-hidden bg-[#071b12] text-white max-w-full">
      {/* Campaign accent */}
      <div className="flex h-1.5 w-full">
        <div className="w-1/3 bg-[#008751]" />
        <div className="w-1/3 bg-white" />
        <div className="w-1/3 bg-[#008751]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Main Footer */}
        <div className="grid grid-cols-1 gap-12 py-14 lg:grid-cols-12 lg:gap-10">
          {/* Brand */}
          <div className="lg:col-span-5">
            <Link href="/" className="group inline-flex items-center gap-4">
              {settings.logoUrl ? (
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-lg">
                  <img src={settings.logoUrl} alt={settings.brandName} className="h-full w-full object-contain" />
                </div>
              ) : (
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#008751] text-white text-xl font-extrabold shadow-lg">
                  PC
                </div>
              )}

              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xl font-extrabold tracking-tight text-[#008751] sm:text-2xl">
                    {settings.brandName.split(" ")[0]}
                  </span>
                  <span className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                    {settings.brandName.split(" ").slice(1).join(" ")}
                  </span>
                </div>

                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50 sm:text-[11px]">
                  {settings.brandTagline}
                </p>
              </div>
            </Link>

            <div className="mt-7 max-w-md">
              <p className="text-[15px] leading-7 text-white/60">
                {settings.heroDescription}
              </p>
            </div>

            {/* Tagline statement */}
            <div className="mt-7 border-l-2 border-[#008751] pl-4">
              <p className="text-sm font-semibold leading-6 text-white/90">
                Data-Driven Political Organization
              </p>
              <p className="mt-1 text-xs leading-5 text-white/40">
                Centralizing campaign intelligence, stakeholder coordination, and field operations in one system.
              </p>
            </div>
          </div>

          {/* Explore */}
          <div className="lg:col-span-2">
            <h4 className="mb-5 text-sm font-bold uppercase tracking-[0.18em] text-white">
              Explore
            </h4>
            <ul className="space-y-3.5">
              {[
                ["About Us / Biography", "/biography"],
                ["Campaign Manifesto", "/manifesto"],
                ["Organization Structure", "/structure"],
                ["News", "/news"],
                ["Gallery", "/gallery"],
                ["Contact", "/contact"],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="group flex items-center gap-2 text-sm text-white/55 transition-colors hover:text-white"
                  >
                    <span className="h-px w-0 bg-[#008751] transition-all duration-300 group-hover:w-4" />
                    {label}
                    <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-all group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Get Involved */}
          <div className="lg:col-span-2">
            <h4 className="mb-5 text-sm font-bold uppercase tracking-[0.18em] text-white">
              Get Involved
            </h4>
            <ul className="space-y-3.5">
              {[
                ["Electoral / Field Officer Portal", "/register-inec-officer"],
                ["Operations Portal", "/portal/dashboard"],
                ["User Guide & Manual", "/documentation"],
                ["Contact Us", "/contact"],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="group flex items-center gap-2 text-sm text-white/55 transition-colors hover:text-white"
                  >
                    <span className="h-px w-0 bg-[#008751] transition-all duration-300 group-hover:w-4" />
                    {label}
                    <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-all group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="lg:col-span-3">
            <h4 className="mb-5 text-sm font-bold uppercase tracking-[0.18em] text-white">
              Contact
            </h4>

            <div className="space-y-3">
              {/* Office */}
              <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#008751]/15 text-[#39b978]">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/35">
                    PolitiCore Operations Center
                  </p>
                  <p className="mt-1 text-sm leading-5 text-white/65">
                    {settings.footerAddress}
                  </p>
                </div>
              </div>

              {/* Phone */}
              <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#008751]/15 text-[#39b978]">
                  <Phone className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/35">
                    Phone
                  </p>
                  <p className="mt-1 text-sm text-white/65">
                    {settings.footerPhone}
                  </p>
                </div>
              </div>

              {/* Email */}
              <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#008751]/15 text-[#39b978]">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/35">
                    Email
                  </p>
                  <p className="mt-1 truncate text-sm text-white/65">
                    {settings.footerEmail}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 border-t border-white/10 py-7">
          <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
            <p className="text-xs text-white/40">
              {settings.copyrightText}
            </p>

            <p className="flex items-center gap-1.5 text-xs text-white/40">
              Designed with
              <Heart className="h-3.5 w-3.5 fill-[#d71920] text-[#d71920]" />
              by{" "}
              <a
                href="https://cyberbillafrica.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#39b978] transition-colors hover:text-white"
              >
                CyberBill Africa
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

