"use client";

/*
 * ============================================================
 * NOTIFICATION BELL
 * ============================================================
 *
 * One panel, two sections:
 *
 *   Notifications  per-user workflow events in the `notifications`
 *                  collection. Live subscription, read state stored on
 *                  the document, clicking opens the linked page.
 *
 *   Announcements  admin broadcasts from `portal_content/main`. Read
 *                  state stays device-local (localStorage) because an
 *                  announcement is one document shared by everybody —
 *                  it has nowhere to store per-user state. Also live
 *                  now, so a new broadcast appears without a reload.
 *
 * The badge is ONE number: unread notifications + unread announcements.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import {
  Bell,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Flag,
  Loader2,
  Megaphone,
  ShieldCheck,
} from "lucide-react";

import {
  markNotificationRead,
  markNotificationsRead,
  subscribeToNotifications,
} from "@/lib/firebase/notifications";
import {
  filterAnnouncementsForProfile,
  subscribeToAnnouncements,
} from "@/lib/firebase/portal-content";
import { BRANDING } from "@/config/branding";

import type {
  Announcement,
  AppNotification,
  NotificationType,
  UserProfile,
} from "@/types";

const READ_STORAGE_KEY = "dcm_read_notifications";

function readStoredIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(READ_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];

    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function storeReadIds(ids: string[]): void {
  try {
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage disabled; the section still works for this session.
  }
}

/** The icon that matches an event's subject, not its severity. */
function NotificationIcon({ type }: { type: NotificationType }) {
  switch (type) {
    case "assignment_created":
    case "assignment_completed":
    case "assignment_approved":
    case "assignment_rejected":
      return <ClipboardCheck className="h-4 w-4" />;

    case "report_reviewed":
      return <FileText className="h-4 w-4" />;

    case "issue_raised":
    case "issue_status_changed":
      return <Flag className="h-4 w-4" />;

    case "role_assigned":
      return <ShieldCheck className="h-4 w-4" />;

    default:
      return <Megaphone className="h-4 w-4" />;
  }
}

export function NotificationBell({ profile }: { profile: UserProfile | null }) {
  const router = useRouter();

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [readIds, setReadIds] = useState<string[]>(readStoredIds);
  const [markingAll, setMarkingAll] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const userId = profile?.id ?? "";

  /* Announcements: live; the first snapshot arrives immediately. */
  useEffect(() => {
    if (!profile) return;

    let cancelled = false;

    const unsubscribe = subscribeToAnnouncements((items) => {
      if (cancelled) return;
      setAnnouncements(filterAnnouncementsForProfile(items, profile));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [profile]);

  /* Notifications: live, scoped to the caller by the query and the rules. */
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = subscribeToNotifications(userId, (items) => {
      setNotifications(items);
      setNotificationsLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  /* Close dropdown on outside click. */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadNotifications = notifications.filter((item) => !item.read);
  const unreadAnnouncements = announcements.filter((item) => !readIds.includes(item.id));

  const unreadCount = unreadNotifications.length + unreadAnnouncements.length;

  /* ------------------------------------------------------------
   * ANNOUNCEMENT READ STATE (device-local)
   * ------------------------------------------------------------ */

  const markAnnouncementsRead = useCallback(() => {
    const allIds = announcements.map((item) => item.id);
    setReadIds(allIds);
    storeReadIds(allIds);
  }, [announcements]);

  const markAnnouncementRead = useCallback((id: string) => {
    setReadIds((current) => {
      if (current.includes(id)) return current;

      const next = [...current, id];
      storeReadIds(next);
      return next;
    });
  }, []);

  /* ------------------------------------------------------------
   * NOTIFICATION READ STATE (per user, in Firestore)
   * ------------------------------------------------------------ */

  async function openNotification(item: AppNotification) {
    if (!item.read) {
      try {
        await markNotificationRead(item.id);
      } catch (error) {
        console.error("Failed to mark the notification read:", error);
      }
    }

    if (item.link) {
      setOpen(false);
      router.push(item.link);
    }
  }

  async function markAllNotificationsRead() {
    if (unreadNotifications.length === 0) return;

    setMarkingAll(true);

    try {
      await markNotificationsRead(unreadNotifications.map((item) => item.id));
    } catch (error) {
      console.error("Failed to mark all notifications read:", error);
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="View notifications and announcements"
      >
        <Bell className="h-5 w-5 text-gray-700 dark:text-gray-200" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-black text-white ring-2 ring-white dark:ring-gray-900 animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl z-50 overflow-hidden text-left">
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {/* ============================ SECTION 1 ============================ */}
            <section>
              <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-800/90">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                  <h3 className="text-sm font-extrabold text-gray-900 dark:text-white">
                    Notifications
                  </h3>
                  {unreadNotifications.length > 0 && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {unreadNotifications.length} new
                    </span>
                  )}
                </div>

                {unreadNotifications.length > 0 && (
                  <button
                    onClick={markAllNotificationsRead}
                    disabled={markingAll}
                    className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-400"
                  >
                    {markingAll ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Mark all read
                  </button>
                )}
              </header>

              {notificationsLoading && notifications.length === 0 ? (
                <div className="flex items-center justify-center gap-2 p-6 text-xs font-medium text-gray-500 dark:text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                  <Bell className="mx-auto mb-2 h-7 w-7 text-gray-300 dark:text-gray-600" />
                  <p className="text-xs font-medium">No notifications yet.</p>
                </div>
              ) : (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void openNotification(item)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                      item.read ? "" : "bg-emerald-50/40 dark:bg-emerald-950/20"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        item.read
                          ? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}
                    >
                      <NotificationIcon type={item.type} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-gray-900 dark:text-white">
                          {item.title}
                        </span>
                        {!item.read && (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
                        )}
                      </span>

                      <span className="mt-1 block text-xs leading-relaxed text-gray-600 line-clamp-2 dark:text-gray-300">
                        {item.message}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </section>

            {/* ============================ SECTION 2 ============================ */}
            <section>
              <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-800/90">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                  <h3 className="text-sm font-extrabold text-gray-900 dark:text-white">
                    Announcements
                  </h3>
                  {unreadAnnouncements.length > 0 && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {unreadAnnouncements.length} new
                    </span>
                  )}
                </div>

                {unreadAnnouncements.length > 0 && (
                  <button
                    onClick={markAnnouncementsRead}
                    className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark all read
                  </button>
                )}
              </header>

              {announcements.length === 0 ? (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                  <Megaphone className="mx-auto mb-2 h-7 w-7 text-gray-300 dark:text-gray-600" />
                  <p className="text-xs font-medium">No announcements available.</p>
                </div>
              ) : (
                announcements.map((item) => {
                  const isUnread = !readIds.includes(item.id);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => markAnnouncementRead(item.id)}
                      className={`block w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                        isUnread ? "bg-emerald-50/40 dark:bg-emerald-950/20" : ""
                      }`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="flex items-center gap-2 text-xs font-bold text-gray-900 dark:text-white">
                          {isUnread && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
                          )}
                          {item.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-gray-400">
                          {item.scope.replace(/_/g, " ").toUpperCase()}
                        </span>
                      </span>

                      <span className="mt-1.5 block text-xs leading-relaxed text-gray-600 line-clamp-3 dark:text-gray-300">
                        {item.content}
                      </span>
                    </button>
                  );
                })
              )}
            </section>
          </div>

          <div className="border-t border-gray-100 bg-gray-50 p-3 text-center dark:border-gray-800 dark:bg-gray-800/40">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
              {`${BRANDING.shortName} Central Broadcast System`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
