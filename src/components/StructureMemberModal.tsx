"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X, Phone, Mail, MapPin, Building2, Layers, ShieldCheck, Maximize2 } from "lucide-react";
import { StructureMember } from "@/lib/firebase/structure";

interface StructureMemberModalProps {
  member: StructureMember | null;
  onClose: () => void;
}

export default function StructureMemberModal({ member, onClose }: StructureMemberModalProps) {
  const [fullscreenImage, setFullscreenImage] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fullscreenImage) {
          setFullscreenImage(false);
        } else {
          onClose();
        }
      }
    };

    if (member) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [member, onClose, fullscreenImage]);

  if (!member) return null;

  const initials = member.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  const levelBadge = member.zone || (
    member.level === "STATE" ? "State Executive" : member.level === "ZONAL" ? "Zonal Executive" : "LGA Executive"
  );

  return (
    <>
      {/* Full-screen Image Viewer Overlay */}
      {fullscreenImage && member.image_url && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in"
          onClick={() => setFullscreenImage(false)}
        >
          <button
            onClick={() => setFullscreenImage(false)}
            className="absolute top-5 right-5 p-3 rounded-full bg-white/20 hover:bg-white/40 text-white transition-all shadow-xl z-50 focus:outline-none"
            aria-label="Close full screen view"
          >
            <X className="h-6 w-6" />
          </button>

          <div className="relative w-full h-full max-w-5xl max-h-[85vh] flex items-center justify-center">
            <Image
              src={member.image_url}
              alt={member.name}
              fill
              unoptimized
              className="object-contain"
            />
          </div>

          <div className="mt-4 text-center text-white">
            <h3 className="font-extrabold text-lg">{member.name}</h3>
            <p className="text-xs text-emerald-400 font-semibold">{member.position}</p>
            <p className="text-[11px] text-gray-400 mt-1">Press ESC or click anywhere to close full screen</p>
          </div>
        </div>
      )}

      {/* Main Details Modal */}
      <div
        className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm transition-opacity duration-200 animate-in fade-in"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col transition-all transform scale-100 animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Header / Image Area — Designed so full face is 100% visible */}
          <div className="relative w-full h-72 sm:h-80 bg-gradient-to-br from-emerald-950 via-emerald-900 to-green-950 flex items-center justify-center overflow-hidden shrink-0">
            {member.image_url && member.image_url.startsWith("http") ? (
              <div className="relative w-full h-full flex items-center justify-center bg-black/40">
                <Image
                  src={member.image_url}
                  alt={member.name}
                  fill
                  unoptimized
                  className="object-contain p-2"
                />

                {/* Full screen expand button */}
                <button
                  onClick={() => setFullscreenImage(true)}
                  className="absolute bottom-3 right-3 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 text-xs font-semibold backdrop-blur-md border border-white/20 flex items-center gap-1.5 transition-all shadow-md"
                  title="View image in full screen"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Full Screen</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-emerald-200 p-6 text-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-800/80 border-2 border-emerald-500/40 text-white font-extrabold text-3xl shadow-xl mb-2">
                  {initials}
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-300/80">
                  PolitiCore Secretariat
                </span>
              </div>
            )}

            {/* Level Tag Overlay */}
            <div className="absolute top-4 left-4 bg-emerald-900/90 backdrop-blur-md text-emerald-100 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-md border border-emerald-500/30 flex items-center gap-1.5 z-10">
              {member.level === "STATE" ? (
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              ) : member.level === "ZONAL" ? (
                <Layers className="h-4 w-4 text-emerald-400" />
              ) : (
                <Building2 className="h-4 w-4 text-emerald-400" />
              )}
              <span>{levelBadge}</span>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              type="button"
              className="absolute top-4 right-4 p-2.5 rounded-full bg-black/60 hover:bg-black/90 text-white transition-all backdrop-blur-md border border-white/20 shadow-lg z-10 group focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Close modal"
            >
              <X className="h-5 w-5 transition-transform group-hover:scale-110" />
            </button>
          </div>

          {/* Modal Content Body */}
          <div className="p-6 sm:p-8 overflow-y-auto space-y-6">
            {/* Member Name and Position Header */}
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight">
                {member.name}
              </h2>
              <p className="text-base sm:text-lg font-bold text-emerald-700 mt-1">
                {member.position}
              </p>

              {member.altTitle && (
                <div className="mt-3 bg-emerald-50/80 border border-emerald-200/90 rounded-xl p-3.5 text-sm font-medium text-emerald-950 italic">
                  &quot;{member.altTitle}&quot;
                </div>
              )}
            </div>

            {/* Details Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm font-medium text-gray-700 pt-2 border-t border-gray-100">
              {member.ward && (
                <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                  <MapPin className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-gray-400">
                      Location / Ward / LGA
                    </span>
                    <span className="text-gray-900 font-semibold">{member.ward}</span>
                  </div>
                </div>
              )}

              {member.phone && (
                <a
                  href={`tel:${member.phone}`}
                  className="flex items-start gap-3 bg-gray-50 rounded-xl p-3.5 border border-gray-100 hover:bg-emerald-50/60 hover:border-emerald-200 transition-colors"
                >
                  <Phone className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-gray-400">
                      Phone Contact
                    </span>
                    <span className="text-gray-900 font-semibold">{member.phone}</span>
                  </div>
                </a>
              )}

              {member.email && (
                <a
                  href={`mailto:${member.email}`}
                  className="flex items-start gap-3 bg-gray-50 rounded-xl p-3.5 border border-gray-100 hover:bg-emerald-50/60 hover:border-emerald-200 transition-colors sm:col-span-2"
                >
                  <Mail className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="truncate">
                    <span className="block text-xs font-bold uppercase tracking-wider text-gray-400">
                      Email Address
                    </span>
                    <span className="text-gray-900 font-semibold truncate block">
                      {member.email}
                    </span>
                  </div>
                </a>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 sm:px-8 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0">
            <span className="text-xs text-gray-400 font-medium hidden sm:inline">
              PolitiCore Political Operations Platform
            </span>
            <button
              onClick={onClose}
              type="button"
              className="w-full sm:w-auto px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-md transition-colors"
            >
              Close Details
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
