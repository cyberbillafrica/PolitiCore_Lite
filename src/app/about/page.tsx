import type { Metadata } from "next";

export const dynamic = "force-dynamic";
import Image from "next/image";
import Link from "next/link";
import { Users, Target, CheckCircle2, ArrowRight } from "lucide-react";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getBiography } from "@/lib/firebase/biography";
import { getCurrentTenant } from "@/lib/firebase/tenants";
import ShareButtons from "@/components/ShareButtons";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const tenant = await getCurrentTenant();
    const aboutData = await getBiography(tenant.id);

    if (!aboutData || aboutData.status !== "published") {
      return {
        title: "About Us | PolitiCore — Political Operations Platform",
        description: "Learn about PolitiCore, our core capabilities, stakeholder management, field operations, and campaign coordination platform.",
      };
    }

    return {
      title: `About Us | PolitiCore`,
      description: aboutData.about?.slice(0, 160) || "PolitiCore Political Operations & Campaign Platform",
    };
  } catch (error) {
    return {
      title: "About Us | PolitiCore — Political Operations Platform",
      description: "Learn about PolitiCore, our core capabilities, stakeholder management, field operations, and campaign coordination platform.",
    };
  }
}

export default async function AboutUsPage() {
  let customAboutText: string | undefined;
  let image_url: string | null | undefined;

  try {
    const tenant = await getCurrentTenant();
    const aboutData = await getBiography(tenant.id);
    customAboutText = aboutData?.about;
    image_url = aboutData?.image_url;
  } catch (err) {
    console.error("Error loading about page data:", err);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-gray-500">
          <Link href="/" className="hover:text-emerald-700">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-800 font-medium">About Us</span>
        </nav>

        {/* Hero Section */}
        <section className="text-center mb-14">
          <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
            Directorate of Contact and Mobilization
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight">
            About DCM Enugu
          </h1>
          <p className="mt-4 text-xl font-semibold text-emerald-700">
            Mobilizing for Good Governance
          </p>
          <p className="mt-3 max-w-3xl mx-auto text-gray-600 leading-relaxed text-base sm:text-lg">
            DCM Enugu serves as a relationship-management, stakeholder-engagement, grassroots outreach, coordination, and mobilization structure dedicated to fostering constructive civic engagement across Enugu State.
          </p>
        </section>

        {/* Dynamic Admin About Text if Published */}
        {customAboutText && (
          <section className="mb-14 rounded-2xl bg-white border border-gray-200 p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">
              Overview & Leadership Message
            </h2>
            <div className="grid md:grid-cols-3 gap-8 items-start">
              {image_url && (
                <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-gray-100 border">
                  <Image
                    src={image_url}
                    alt="DCM Enugu Secretariat"
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
              )}
              <div className={image_url ? "md:col-span-2" : "md:col-span-3"}>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap text-base">
                  {customAboutText}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Contact vs Mobilization Concept */}
        <section className="mb-14 bg-gradient-to-br from-emerald-900 to-green-950 text-white rounded-2xl p-8 sm:p-10 shadow-lg">
          <div className="max-w-3xl mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Understanding Contact & Mobilization
            </h2>
            <p className="text-emerald-100/90 mt-2 text-sm sm:text-base">
              DCM Enugu operates on two distinct but complementary pillars that form the bedrock of our grassroots engagement strategy.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white/10 rounded-xl p-6 border border-white/10 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-lg bg-emerald-500/30 text-emerald-300">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white">1. Contact</h3>
              </div>
              <p className="text-sm font-semibold text-emerald-200 mb-2">
                &quot;Who do we need to engage, and how do we maintain those relationships?&quot;
              </p>
              <p className="text-sm text-gray-200 leading-relaxed">
                Contact focuses on proactive stakeholder relationship management. We identify, reach out to, and build lasting, respectful partnerships with traditional rulers, religious leaders, professional associations, youth/women groups, and civil-society organizations.
              </p>
            </div>

            <div className="bg-white/10 rounded-xl p-6 border border-white/10 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-lg bg-emerald-500/30 text-emerald-300">
                  <Target className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-white">2. Mobilization</h3>
              </div>
              <p className="text-sm font-semibold text-emerald-200 mb-2">
                &quot;How do we organize people who have chosen to participate?&quot;
              </p>
              <p className="text-sm text-gray-200 leading-relaxed">
                Mobilization coordinates participants so they can actively and lawfully take part in meetings, consultations, rallies, community forums, and civic development activities across Enugu State.
              </p>
            </div>
          </div>
        </section>

        {/* Core Responsibilities Grid */}
        <section className="mb-14">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900">
              Core Responsibilities
            </h2>
            <p className="text-gray-600 mt-2">
              The operational mandate driving DCM Enugu across all administrative levels
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: "Stakeholder Contact",
                desc: "Maintain relationships with community leaders, traditional and religious leaders, professional groups, youth and women organizations, and civil-society groups.",
              },
              {
                title: "Mobilization",
                desc: "Organize and coordinate members, supporters, volunteers, and participants for meetings, consultations, conventions, rallies, and lawful activities.",
              },
              {
                title: "Grassroots Outreach",
                desc: "Establish direct contact with local communities and structures to communicate organizational positions, programs, and opportunities.",
              },
              {
                title: "Stakeholder Mapping",
                desc: "Systematically identify important groups and key individuals across wards, local government areas, senatorial zones, and state units.",
              },
              {
                title: "Coordination",
                desc: "Coordinate activities across various organizational levels to maintain operational synergy and avoid duplication of efforts.",
              },
              {
                title: "Feedback Mechanism",
                desc: "Collect genuine concerns, ideas, and feedback from communities and stakeholders to communicate directly to leadership.",
              },
              {
                title: "Event Organization",
                desc: "Coordinate invitations, attendance, protocol, liaison, transportation, and assigned event logistics for official gatherings.",
              },
              {
                title: "Records & Reporting",
                desc: "Maintain structured contact information and produce detailed reports covering meetings, outreach, participation, and outstanding issues.",
              },
              {
                title: "Conflict Management",
                desc: "Help maintain constructive relationships between the organization and stakeholder groups, escalating disputes to leadership when needed.",
              },
            ].map((resp, i) => (
              <div key={i} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <h3 className="font-bold text-gray-900 text-base">{resp.title}</h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{resp.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Organizational Structure Tier Summary */}
        <section className="mb-14 bg-emerald-50/70 border border-emerald-200 rounded-2xl p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Structure & Hierarchy
              </span>
              <h2 className="text-2xl font-bold text-gray-900 mt-1">
                Flexible Organizational Hierarchy
              </h2>
              <p className="text-sm text-gray-600 mt-2 max-w-xl">
                Our structure connects leadership seamlessly to every community unit in Enugu State:
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-emerald-900">
                <span className="bg-emerald-200/80 px-3 py-1.5 rounded-lg">State Executive</span>
                <span>→</span>
                <span className="bg-emerald-200/80 px-3 py-1.5 rounded-lg">Zonal Coordinators</span>
                <span>→</span>
                <span className="bg-emerald-200/80 px-3 py-1.5 rounded-lg">LGA Coordinators</span>
                <span>→</span>
                <span className="bg-emerald-200/80 px-3 py-1.5 rounded-lg">Ward Coordinators</span>
                <span>→</span>
                <span className="bg-emerald-200/80 px-3 py-1.5 rounded-lg">Community/Unit Teams</span>
              </div>
            </div>

            <Link
              href="/structure"
              className="inline-flex items-center justify-center gap-2 bg-emerald-700 text-white px-6 py-3 rounded-lg font-bold hover:bg-emerald-800 transition-colors shrink-0"
            >
              View Our Structure
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Share Section */}
        <ShareButtons />
      </main>

      <Footer />
    </div>
  );
}
