import type { Metadata } from "next";

export const dynamic = "force-dynamic";
import Image from "next/image";
import Link from "next/link";
import { User, Award, ArrowRight } from "lucide-react";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getBiography } from "@/lib/firebase/biography";
import { getCurrentTenant } from "@/lib/firebase/tenants";
import ShareButtons from "@/components/ShareButtons";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const tenant = await getCurrentTenant();
    const bioData = await getBiography(tenant.id);

    if (!bioData || bioData.status !== "published") {
      return {
        title: "Candidate Biography | PolitiCore Campaign Platform",
        description: "Read the official candidate biography, background, leadership journey, and public service record.",
      };
    }

    return {
      title: `${bioData.full_name || "Candidate"} — Biography | PolitiCore`,
      description: bioData.about?.slice(0, 160) || "Candidate leadership journey and public service record.",
    };
  } catch (error) {
    return {
      title: "Candidate Biography | PolitiCore Campaign Platform",
      description: "Read the official candidate biography, background, leadership journey, and public service record.",
    };
  }
}

export default async function BiographyPage() {
  let fullName = "Candidate Profile";
  let title = "Leadership & Vision";
  let aboutText = "";
  let imageUrl: string | null | undefined = null;
  let stats = { years_experience: 15, communities_served: 50, volunteers: 1000 };

  try {
    const tenant = await getCurrentTenant();
    const bioData = await getBiography(tenant.id);
    if (bioData && bioData.status === "published") {
      fullName = bioData.full_name || fullName;
      title = bioData.title || title;
      aboutText = bioData.about || "";
      imageUrl = bioData.image_url;
      if (bioData.stats) {
        stats = bioData.stats;
      }
    }
  } catch (err) {
    console.error("Error loading biography page data:", err);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-gray-500">
          <Link href="/" className="hover:text-emerald-700">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-800 font-medium">Candidate Biography</span>
        </nav>

        {/* Hero Card */}
        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 sm:p-12 mb-12 overflow-hidden">
          <div className="grid md:grid-cols-12 gap-8 items-center">
            {/* Image Column */}
            <div className="md:col-span-5 flex justify-center">
              {imageUrl ? (
                <div className="relative w-full max-w-sm aspect-[4/5] rounded-2xl overflow-hidden shadow-xl border-4 border-white bg-gray-100">
                  <Image
                    src={imageUrl}
                    alt={fullName}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="w-full max-w-sm aspect-[4/5] rounded-2xl bg-gradient-to-br from-emerald-900 to-green-950 flex flex-col items-center justify-center text-white shadow-xl p-8 text-center">
                  <User className="h-20 w-20 text-emerald-400 mb-4" />
                  <span className="font-bold text-xl">{fullName}</span>
                  <span className="text-xs text-emerald-200 mt-1">{title}</span>
                </div>
              )}
            </div>

            {/* Text Column */}
            <div className="md:col-span-7 space-y-6">
              <div>
                <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
                  Official Candidate Biography
                </span>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                  {fullName}
                </h1>
                <p className="text-lg font-semibold text-emerald-700 mt-1">
                  {title}
                </p>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-b border-gray-100 py-4">
                <div>
                  <span className="block text-2xl font-black text-emerald-700">{stats.years_experience}+</span>
                  <span className="text-xs text-gray-500 font-medium">Years Experience</span>
                </div>
                <div>
                  <span className="block text-2xl font-black text-emerald-700">{stats.communities_served}+</span>
                  <span className="text-xs text-gray-500 font-medium">Communities</span>
                </div>
                <div>
                  <span className="block text-2xl font-black text-emerald-700">{stats.volunteers}+</span>
                  <span className="text-xs text-gray-500 font-medium">Volunteers</span>
                </div>
              </div>

              <div className="pt-2">
                <Link
                  href="/manifesto"
                  className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md transition-all"
                >
                  Read Campaign Manifesto
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Detailed Biography Text */}
        {aboutText ? (
          <section className="bg-white rounded-3xl border border-gray-200 p-8 sm:p-10 shadow-sm mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-3 border-b border-gray-100 flex items-center gap-2">
              <Award className="h-6 w-6 text-emerald-700" />
              Leadership Journey & Public Service Record
            </h2>
            <div className="prose prose-lg max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
              {aboutText}
            </div>
          </section>
        ) : (
          <section className="bg-white rounded-3xl border border-gray-200 p-8 text-center mb-12">
            <p className="text-gray-500 text-sm">
              Biography details are being updated by the campaign team.
            </p>
          </section>
        )}

        {/* Share Section */}
        <ShareButtons />
      </main>

      <Footer />
    </div>
  );
}
