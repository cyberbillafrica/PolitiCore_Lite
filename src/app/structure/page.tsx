import type { Metadata } from "next";

export const dynamic = "force-dynamic";
import Link from "next/link";
import Image from "next/image";
import { User, Phone, Mail, MapPin, Building2, Layers, ShieldCheck } from "lucide-react";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ShareButtons from "@/components/ShareButtons";
import { getCurrentTenant } from "@/lib/firebase/tenants";
import { getStructureMembers, StructureMember } from "@/lib/firebase/structure";

export const metadata: Metadata = {
  title: "Our Structure | DCM Enugu — Directorate of Contact and Mobilization",
  description: "Explore the organizational structure and members of DCM Enugu across State, Zonal, and Local Government Area levels.",
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
            Directorate Hierarchy & Leadership
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight">
            Our Organizational Structure
          </h1>
          <p className="mt-3 text-lg text-emerald-700 font-medium">
            DCM Enugu Structure Members
          </p>
          <p className="mt-2 max-w-2xl mx-auto text-gray-600">
            Coordinating grassroots mobilization and stakeholder engagement across State, Senatorial Zone, and Local Government Area levels in Enugu State.
          </p>
        </section>

        {/* Level 1: State Structure */}
        <section className="mb-14">
          <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-emerald-600">
            <ShieldCheck className="h-7 w-7 text-emerald-700 shrink-0" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">State Structure</h2>
              <p className="text-sm text-gray-500">State Officers & Key Directorate Leadership</p>
            </div>
          </div>

          {stateMembers.length === 0 ? (
            <EmptyStateLevel levelName="State Executives" />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {stateMembers.map((member) => (
                <MemberCard key={member.id} member={member} />
              ))}
            </div>
          )}
        </section>

        {/* Level 2: Zonal Structure */}
        <section className="mb-14">
          <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-emerald-600">
            <Layers className="h-7 w-7 text-emerald-700 shrink-0" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Zonal Structure</h2>
              <p className="text-sm text-gray-500">Senatorial Zonal Coordinators & Representative Teams</p>
            </div>
          </div>

          {zonalMembers.length === 0 ? (
            <EmptyStateLevel levelName="Zonal Officers" />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {zonalMembers.map((member) => (
                <MemberCard key={member.id} member={member} />
              ))}
            </div>
          )}
        </section>

        {/* Level 3: Local Government Structure */}
        <section className="mb-14">
          <div className="flex items-center gap-3 mb-6 pb-3 border-b-2 border-emerald-600">
            <Building2 className="h-7 w-7 text-emerald-700 shrink-0" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Local Government Structure</h2>
              <p className="text-sm text-gray-500">LGA Coordinators & Ward Liaison Officers across all 17 LGAs</p>
            </div>
          </div>

          {lgaMembers.length === 0 ? (
            <EmptyStateLevel levelName="LGA Coordinators" />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {lgaMembers.map((member) => (
                <MemberCard key={member.id} member={member} />
              ))}
            </div>
          )}
        </section>

        {/* Share Section */}
        <ShareButtons />
      </main>

      <Footer />
    </div>
  );
}

function MemberCard({ member }: { member: StructureMember }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col justify-between group">
      <div>
        {/* Large Prominent Image Container */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-green-950 flex items-center justify-center text-white">
          {member.image_url && member.image_url.startsWith("http") ? (
            <Image
              src={member.image_url}
              alt={member.name}
              fill
              unoptimized
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-emerald-200/80 p-6 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-800/60 border border-emerald-500/30 text-white font-extrabold text-2xl shadow-inner mb-2">
                {member.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/60">DCM Enugu Secretariat</span>
            </div>
          )}

          {/* Level or Zone Tag */}
          {(member.zone || member.level) && (
            <div className="absolute top-3 left-3 bg-emerald-900/90 backdrop-blur-md text-emerald-100 px-3 py-1 rounded-full text-xs font-semibold shadow-md border border-emerald-500/20 z-10">
              {member.zone || `${member.level} Executive`}
            </div>
          )}
        </div>

        {/* Content Details */}
        <div className="p-6">
          <h3 className="font-extrabold text-gray-900 text-xl leading-tight" title={member.name}>
            {member.name}
          </h3>

          <p className="text-sm font-bold text-emerald-700 mt-1">
            {member.position}
          </p>

          {member.altTitle && (
            <p className="text-xs font-medium text-emerald-900/80 bg-emerald-50 border border-emerald-200/80 rounded-lg p-2.5 mt-2.5 leading-relaxed italic">
              "{member.altTitle}"
            </p>
          )}

          {member.ward && (
            <p className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-gray-600">
              <MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              {member.ward}
            </p>
          )}
        </div>
      </div>

      {(member.phone || member.email) && (
        <div className="p-6 pt-0 mt-auto border-t border-gray-100/80 space-y-2 text-xs font-medium text-gray-600">
          {member.phone && (
            <a
              href={`tel:${member.phone}`}
              className="flex items-center gap-2 hover:text-emerald-700 transition-colors truncate pt-3"
            >
              <Phone className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>{member.phone}</span>
            </a>
          )}
          {member.email && (
            <a
              href={`mailto:${member.email}`}
              className="flex items-center gap-2 hover:text-emerald-700 transition-colors truncate"
            >
              <Mail className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">{member.email}</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyStateLevel({ levelName }: { levelName: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
      <p className="text-sm font-medium text-gray-500">
        No {levelName} currently published in this category.
      </p>
      <p className="text-xs text-gray-400 mt-1">
        Coordinators are regularly added by the DCM Enugu secretariat.
      </p>
    </div>
  );
}
