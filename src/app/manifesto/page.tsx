import type { Metadata } from "next";

export const dynamic = "force-dynamic";
import Link from "next/link";
import { CheckCircle2, Download, ArrowRight } from "lucide-react";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getManifesto } from "@/lib/firebase/manifesto";
import { getCurrentTenant } from "@/lib/firebase/tenants";
import ShareButtons from "@/components/ShareButtons";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const tenant = await getCurrentTenant();
    const manifestoData = await getManifesto(tenant.id);

    if (!manifestoData || manifestoData.status !== "published") {
      return {
        title: "Campaign Manifesto | PolitiCore Platform",
        description: "Explore our strategic manifesto, policy commitments, governance vision, and development blueprint.",
      };
    }

    return {
      title: `${manifestoData.title || "Campaign Manifesto"} | PolitiCore`,
      description: manifestoData.subtitle || "Campaign policy commitments and governance vision.",
    };
  } catch (error) {
    return {
      title: "Campaign Manifesto | PolitiCore Platform",
      description: "Explore our strategic manifesto, policy commitments, governance vision, and development blueprint.",
    };
  }
}

export default async function ManifestoPage() {
  let manifesto = null;

  try {
    const tenant = await getCurrentTenant();
    const data = await getManifesto(tenant.id);
    if (data && data.status === "published") {
      manifesto = data;
    }
  } catch (err) {
    console.error("Error loading manifesto page data:", err);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-gray-500">
          <Link href="/" className="hover:text-emerald-700">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-800 font-medium">Campaign Manifesto</span>
        </nav>

        {/* Hero Banner */}
        <section className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-green-950 text-white rounded-3xl p-8 sm:p-12 mb-12 shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-3xl">
            <span className="inline-block px-3.5 py-1.5 bg-white/10 border border-white/20 text-emerald-200 rounded-full text-xs font-bold uppercase tracking-wider mb-4">
              Official Policy Blueprint & Commitments
            </span>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
              {manifesto?.title || "Campaign Manifesto & Action Plan"}
            </h1>
            <p className="mt-3 text-lg sm:text-xl font-semibold text-emerald-200">
              {manifesto?.subtitle || "Building a Transparent, Accountable, and Prosperous Future"}
            </p>
            <p className="mt-4 text-sm sm:text-base text-gray-200 leading-relaxed">
              {manifesto?.introduction || "Our manifesto represents a solemn contract with the people—driven by actionable policy pillars, measurable economic development, security, and civic empowerment."}
            </p>

            {manifesto?.pdf_url && (
              <div className="mt-6 pt-4 border-t border-white/10">
                <a
                  href={manifesto.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-gray-950 px-6 py-3 rounded-xl font-black text-sm shadow-lg transition-all"
                >
                  <Download className="h-4 w-4" />
                  Download Full Manifesto Document (PDF)
                </a>
              </div>
            )}
          </div>
        </section>

        {/* Strategic Policy Sections */}
        {manifesto && manifesto.sections && manifesto.sections.length > 0 ? (
          <section className="mb-12 space-y-8">
            <div className="text-center max-w-2xl mx-auto mb-8">
              <h2 className="text-3xl font-extrabold text-gray-900">
                Core Policy Pillars
              </h2>
              <p className="text-sm text-gray-600 mt-2">
                Detailed development commitments and action programs
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              {manifesto.sections.map((section, idx) => (
                <div
                  key={section.id || idx}
                  className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm hover:shadow-md transition-shadow space-y-4"
                >
                  <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 text-lg font-black">
                      {idx + 1}
                    </span>
                    <h3 className="text-xl font-bold text-gray-900">
                      {section.title}
                    </h3>
                  </div>

                  <p className="text-sm text-gray-600 leading-relaxed">
                    {section.description}
                  </p>

                  {section.points && section.points.length > 0 && (
                    <ul className="space-y-2.5 pt-2">
                      {section.points.map((pt, pIdx) => (
                        <li key={pIdx} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-700">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="bg-white rounded-3xl border border-gray-200 p-8 text-center mb-12">
            <p className="text-gray-500 text-sm">
              Manifesto policy sections are currently being updated by the campaign team.
            </p>
          </section>
        )}

        {/* Closing Call to Action */}
        {manifesto?.closing && (
          <section className="bg-emerald-50 rounded-3xl border border-emerald-200 p-8 sm:p-10 mb-12 text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-3">Together We Can Achieve More</h3>
            <p className="text-sm text-gray-700 max-w-2xl mx-auto leading-relaxed mb-6">
              {manifesto.closing}
            </p>

            <Link
              href={manifesto.call_to_action_link || "/volunteer"}
              className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-8 py-3.5 rounded-xl font-bold text-sm shadow-md transition-all"
            >
              {manifesto.call_to_action || "Join Our Campaign Today"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        )}

        {/* Share Section */}
        <ShareButtons />
      </main>

      <Footer />
    </div>
  );
}
