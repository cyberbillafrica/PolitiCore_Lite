"use client";

import { useState } from "react";
import Image from "next/image";
import { MapPin, ShieldCheck, Layers, Building2, ExternalLink } from "lucide-react";
import { StructureMember } from "@/lib/firebase/structure";
import StructureMemberModal from "./StructureMemberModal";

interface StructureListProps {
  stateMembers: StructureMember[];
  zonalMembers: StructureMember[];
  lgaMembers: StructureMember[];
}

export default function StructureList({
  stateMembers,
  zonalMembers,
  lgaMembers,
}: StructureListProps) {
  const [selectedMember, setSelectedMember] = useState<StructureMember | null>(null);

  return (
    <>
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
              <MemberCard
                key={member.id}
                member={member}
                onClick={() => setSelectedMember(member)}
              />
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
              <MemberCard
                key={member.id}
                member={member}
                onClick={() => setSelectedMember(member)}
              />
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
              <MemberCard
                key={member.id}
                member={member}
                onClick={() => setSelectedMember(member)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Pop-up Detail Modal */}
      <StructureMemberModal
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
      />
    </>
  );
}

function MemberCard({
  member,
  onClick,
}: {
  member: StructureMember;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-xl transition-all cursor-pointer overflow-hidden flex flex-col justify-between group transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-emerald-600"
    >
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
                {member.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/60">
                PolitiCore Secretariat
              </span>
            </div>
          )}

          {/* Level or Zone Tag */}
          {(member.zone || member.level) && (
            <div className="absolute top-3 left-3 bg-emerald-900/90 backdrop-blur-md text-emerald-100 px-3 py-1 rounded-full text-xs font-semibold shadow-md border border-emerald-500/20 z-10">
              {member.zone || `${member.level} Executive`}
            </div>
          )}

          {/* Click hint badge */}
          <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md text-white/90 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <ExternalLink className="h-4 w-4" />
          </div>
        </div>

        {/* Content Details */}
        <div className="p-6">
          <h3
            className="font-extrabold text-gray-900 text-xl leading-tight group-hover:text-emerald-700 transition-colors"
            title={member.name}
          >
            {member.name}
          </h3>

          <p className="text-sm font-bold text-emerald-700 mt-1">
            {member.position}
          </p>

          {member.altTitle && (
            <p className="text-xs font-medium text-emerald-900/80 bg-emerald-50 border border-emerald-200/80 rounded-lg p-2.5 mt-2.5 leading-relaxed italic">
              &quot;{member.altTitle}&quot;
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

      <div className="p-6 pt-0 mt-auto border-t border-gray-100/80 flex items-center justify-between text-xs font-semibold text-emerald-700 pt-3">
        <span className="group-hover:underline flex items-center gap-1">
          View Profile & Contact Details &rarr;
        </span>
      </div>
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
        Coordinators are regularly added by the PolitiCore operations secretariat.
      </p>
    </div>
  );
}
