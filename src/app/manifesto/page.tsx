// src/app/manifesto/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { Download, ArrowRight, CheckCircle2 } from "lucide-react";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ShareButtons from "@/components/ShareButtons";

import { getManifesto } from "@/lib/firebase/manifesto";
import {
  cloudinaryDownloadUrl,
  hasText,
  isPublished,
  isValidHttpUrl,
  normalizeManifestoSections,
} from "@/lib/public-content";

/*
 * The manifesto is edited from the admin portal, so this page must
 * read Firestore on every request instead of being frozen into static
 * HTML at build time.
 */
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────
// METADATA
// ─────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
  const manifesto = await getManifesto();

  if (!isPublished(manifesto)) {
    return {
      title: "Manifesto | Campaign",
      description: "Our vision and commitments for progress.",
    };
  }

  return {
    title: `${manifesto.title} | ${manifesto.candidate_name}`,
    description:
      manifesto.subtitle ||
      manifesto.introduction?.slice(0, 160) ||
      "Our vision and commitments for progress.",
  };
}

// ─────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────

export default async function ManifestoPage() {
  const manifesto = await getManifesto();

  if (!isPublished(manifesto)) {
    return <ManifestoComingSoon />;
  }

  const {
    title,
    subtitle,
    introduction,
    sections,
    closing,
    call_to_action,
    call_to_action_link,
    candidate_name,
    candidate_title,
    pdf_url,
  } = manifesto;

  const renderableSections = normalizeManifestoSections(sections);
  const hasPdf = isValidHttpUrl(pdf_url);
  // Cloudinary serves the raw PDF inline (needed by the iframe), so the
  // download buttons ask for the attachment-flagged URL instead.
  const pdfDownloadUrl = cloudinaryDownloadUrl(pdf_url);
  const hasClosing = hasText(closing);
  const hasCta = hasText(call_to_action_link) && hasText(call_to_action);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* ─── HERO ─── */}
        <section className="text-center mb-12">
          {hasText(candidate_title) && (
            <p className="text-sm font-semibold uppercase tracking-wider text-apc-primary">
              {candidate_title}
            </p>
          )}

          <h1 className="mt-3 text-4xl sm:text-5xl font-bold text-gray-900">
            {title}
          </h1>

          {hasText(subtitle) && (
            <p className="mt-4 max-w-3xl mx-auto text-lg text-gray-600">
              {subtitle}
            </p>
          )}

          {hasText(candidate_name) && (
            <p className="mt-3 text-sm text-gray-500">{candidate_name}</p>
          )}

          {hasPdf && (
            <a
              href={pdfDownloadUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-apc-primary px-6 py-3 text-sm font-semibold text-white hover:bg-apc-dark transition-colors"
            >
              <Download className="h-5 w-5" />
              Download Manifesto (PDF)
            </a>
          )}
        </section>

        {/* ─── INTRODUCTION (skipped when empty) ─── */}
        {hasText(introduction) && (
          <section className="mb-12 rounded-2xl bg-white border border-gray-100 p-8 shadow-sm">
            <p className="text-lg leading-relaxed text-gray-700">
              {introduction}
            </p>
          </section>
        )}

        {/* ─── SECTIONS ─── */}
        {renderableSections.length > 0 && (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {renderableSections.map((section) => (
              <div
                key={section.id}
                className="rounded-xl bg-white border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                {hasText(section.icon) && (
                  <div className="mb-3 text-3xl">{section.icon}</div>
                )}

                <h2 className="text-xl font-semibold text-apc-primary">
                  {section.title}
                </h2>

                {hasText(section.description) && (
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    {section.description}
                  </p>
                )}

                {section.points.length > 0 && (
                  <ul className="mt-5 space-y-3">
                    {section.points.map((point, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-sm text-gray-700"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-apc-green" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ─── CLOSING + CALL TO ACTION (skipped when empty) ─── */}
        {(hasClosing || hasCta) && (
          <section className="mt-12 rounded-2xl bg-apc-primary/5 border border-apc-primary/10 p-8 text-center">
            {hasClosing && (
              <p className="mx-auto max-w-3xl text-lg font-medium text-gray-800">
                {closing}
              </p>
            )}

            {hasCta && (
              <Link
                href={call_to_action_link}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-apc-green px-8 py-3 font-semibold text-white hover:bg-green-700 transition-colors"
              >
                {call_to_action}
                <ArrowRight className="h-5 w-5" />
              </Link>
            )}
          </section>
        )}

        {/* ─── FULL MANIFESTO PDF (hidden when no PDF is uploaded) ─── */}
        {hasPdf && (
          <section className="mt-12">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-bold text-gray-900">
                Full Manifesto PDF
              </h2>

              <a
                href={pdfDownloadUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-apc-primary px-4 py-2 text-sm font-semibold text-apc-primary hover:bg-apc-primary hover:text-white transition-colors"
              >
                <Download className="h-4 w-4" />
                Download Manifesto PDF
              </a>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <iframe
                src={pdf_url as string}
                title={`${title} — full manifesto PDF`}
                className="h-[600px] w-full"
              />
            </div>

            {/* Some mobile browsers refuse to render a PDF inline. */}
            <p className="mt-3 text-center text-xs text-gray-500">
              PDF not displaying?{" "}
              <a
                href={pdf_url as string}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-apc-primary hover:underline"
              >
                Open it in a new tab
              </a>
            </p>
          </section>
        )}

        {/* ─── SHARE ─── */}
        <ShareButtons />
      </main>

      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────────
// COMING SOON
// ─────────────────────────────────────────────

function ManifestoComingSoon() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="text-center max-w-2xl">
          <div className="text-6xl mb-6">📋</div>
          <h1 className="text-3xl font-bold text-gray-900">
            Manifesto Coming Soon
          </h1>
          <p className="mt-3 text-gray-600 max-w-md mx-auto">
            Our vision and commitments will be published shortly. Check back for
            updates.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 text-apc-primary font-semibold hover:underline"
          >
            ← Back to Home
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
