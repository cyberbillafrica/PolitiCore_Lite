"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Megaphone, CheckCircle2 } from "lucide-react";
import { getUserAnnouncements } from "@/lib/firebase/firestore";
import type { Announcement, UserProfile } from "@/types";

export function NotificationBell({ profile }: { profile: UserProfile | null }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("dcm_read_notifications");
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Ignore parse error
    }
    return [];
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile) return;
    getUserAnnouncements(profile)
      .then(setAnnouncements)
      .catch((err) => {
        console.error("Failed to fetch notifications:", err);
      });
  }, [profile]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = announcements.filter((a) => !readIds.includes(a.id)).length;

  const markAllAsRead = () => {
    const allIds = announcements.map((a) => a.id);
    setReadIds(allIds);
    try {
      localStorage.setItem("dcm_read_notifications", JSON.stringify(allIds));
    } catch {
      // Ignore
    }
  };

  const markAsRead = (id: string) => {
    if (!readIds.includes(id)) {
      const updated = [...readIds, id];
      setReadIds(updated);
      try {
        localStorage.setItem("dcm_read_notifications", JSON.stringify(updated));
      } catch {
        // Ignore
      }
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="View announcements and notifications"
      >
        <Bell className="h-5 w-5 text-gray-700 dark:text-gray-200" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-black text-white ring-2 ring-white dark:ring-gray-900 animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Drawer */}
      {open && (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl z-50 overflow-hidden text-left">
          {/* Header */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/40">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
              <h3 className="font-extrabold text-sm text-gray-900 dark:text-white">
                Announcements & Alerts
              </h3>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {announcements.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <Bell className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-xs font-medium">No announcements available.</p>
              </div>
            ) : (
              announcements.map((item) => {
                const isUnread = !readIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => markAsRead(item.id)}
                    className={`p-4 transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                      isUnread ? "bg-emerald-50/40 dark:bg-emerald-950/20" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-xs text-gray-900 dark:text-white flex items-center gap-2">
                        {isUnread && (
                          <span className="h-2 w-2 rounded-full bg-emerald-600 shrink-0" />
                        )}
                        {item.title}
                      </h4>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {(item as unknown as { target_type?: string }).target_type ? (item as unknown as { target_type?: string }).target_type!.toUpperCase() : "ALL"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1.5 leading-relaxed line-clamp-3">
                      {item.content}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-800 text-center">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
              PolitiCore Central Broadcast System
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

