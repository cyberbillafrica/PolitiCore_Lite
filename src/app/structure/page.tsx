import type { Metadata } from "next";

export const dynamic = "force-dynamic";
import Link from "next/link";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ShareButtons from "@/components/ShareButtons";
import StructureList from "@/components/StructureList";
import { getCurrentTenant } from "@/lib/firebase/tenants";
import { getStructureMembers, StructureMember } from "@/lib/firebase/structure";

export const metadata: Metadata = {
  title: "Organization Structure | PolitiCore Operations Platform",
  description: "Explore the organizational structure and officers of PolitiCore across Executive, Regional, Zonal, District, and Local Area levels.",
};

export default async function OurStructurePage() {
  let members: StructureMember[] = [];

  try {
    const tenant = await getCurrentTenant();
    members = await getStructureMembers(tenant.id);
  } catch (err) {
    console.error("Error loading structure members:", err);
  }

  const stateMembers = members.filter((m) => m.level === "STATE");
  const zonalMembers = members.filter((m) => m.level === "ZONAL");
  const lgaMembers = members.filter((m) => m.level === "LGA");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-gray-500">
          <Link href="/" className="hover:text-emerald-700">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-800 font-medium">Our Structure</span>
        </nav>

        {/* Hero */}
        <section className="text-center mb-14">
          <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
            Platform Hierarchy & Leadership
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight">
            Our Organizational Structure
          </h1>
          <p className="mt-3 text-lg text-emerald-700 font-medium">
            PolitiCore Organization Officers
          </p>
          <p className="mt-2 max-w-2xl mx-auto text-gray-600">
            Coordinating grassroots mobilization, stakeholder engagement, and campaign intelligence across Executive, Zonal, District, and Local Area levels.
          </p>
        </section>

        {/* Interactive Structure List with Pop-up Modal */}
        <StructureList
          stateMembers={stateMembers}
          zonalMembers={zonalMembers}
          lgaMembers={lgaMembers}
        />

        {/* Share Section */}
        <ShareButtons />
      </main>

      <Footer />
    </div>
  );
}
