// src/lib/firebase/portal-content.ts

import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import type {
  PortalContent,
  PortalContentData,
  Announcement,
  EventData,
  UserProfile,
} from "@/types";

const COLLECTION = "portal_content";
const DOC_ID = "main";

/**
 * Read the portal content document (flat doc `portal_content/main`).
 *
 * All announcements and events live as items inside this single
 * document.
 */
export async function getPortalContent(): Promise<PortalContent[]> {
  try {
    const ref = doc(db, COLLECTION, DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return [];
    const data = snap.data() as PortalContentData;
    return data.items || [];
  } catch (error) {
    console.error("Error fetching portal content:", error);
    return [];
  }
}

export async function savePortalContent(
  items: PortalContent[],
): Promise<void> {
  const ref = doc(db, COLLECTION, DOC_ID);
  await setDoc(
    ref,
    {
      items,
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
}

// ─── ANNOUNCEMENTS ───

export async function getAnnouncements(): Promise<Announcement[]> {
  const items = await getPortalContent();
  return items.filter(
    (item): item is Announcement => item.type === "announcement",
  );
}

/**
 * The announcements one profile may see.
 *
 * `portal_content/main` is a single document every signed-in account can
 * read, so the audience rule is applied here rather than in Firestore.
 * Shared by the one-shot read and the live subscription in the bell.
 */
export function filterAnnouncementsForProfile(
  items: Announcement[],
  profile: UserProfile | null | undefined,
): Announcement[] {
  return items.filter((announcement) => {
    if (announcement.scope === "general") return true;
    if (announcement.scope === "admins" && profile?.access_role === "admin")
      return true;
    if (
      announcement.scope === "campaign_members" &&
      profile?.membership_types?.includes("campaign_member")
    )
      return true;
    if (
      announcement.scope === "social_members" &&
      profile?.membership_types?.includes("social_member")
    )
      return true;
    if (
      announcement.scope === "election_officers" &&
      profile?.access_role === "election_officer"
    )
      return true;
    return false;
  });
}

/**
 * Live announcements from `portal_content/main`.
 *
 * A new broadcast appears in an open bell without a reload. Returns the
 * unsubscribe function `onSnapshot()` hands back.
 */
export function subscribeToAnnouncements(
  onChange: (items: Announcement[]) => void,
): () => void {
  return onSnapshot(
    doc(db, COLLECTION, DOC_ID),
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange([]);
        return;
      }

      const data = snapshot.data() as PortalContentData;

      onChange(
        (data.items ?? []).filter(
          (item): item is Announcement => item.type === "announcement",
        ),
      );
    },
    (error) => {
      console.error("Failed to watch announcements:", error);
    },
  );
}

export async function addAnnouncement(
  announcement: Omit<Announcement, "id" | "created_at" | "updated_at">,
): Promise<void> {
  const items = await getPortalContent();
  const newItem: Announcement = {
    ...announcement,
    id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "announcement",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await savePortalContent([newItem, ...items]);
}

export async function updateAnnouncement(
  announcementId: string,
  updates: Partial<Omit<Announcement, "id" | "type" | "created_at">>,
): Promise<void> {
  const items = await getPortalContent();
  const updated = items.map((item) =>
    item.id === announcementId && item.type === "announcement"
      ? { ...item, ...updates, updated_at: new Date().toISOString() }
      : item,
  );
  await savePortalContent(updated);
}

export async function deleteAnnouncement(
  announcementId: string,
): Promise<void> {
  const items = await getPortalContent();
  await savePortalContent(
    items.filter((item) => item.id !== announcementId),
  );
}

// ─── EVENTS ───

export async function getPublishedEvents(): Promise<EventData[]> {
  const items = await getPortalContent();
  return items
    .filter(
      (item): item is EventData =>
        item.type === "event" && item.status === "published",
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function addEvent(
  event: Omit<EventData, "id" | "type" | "created_at" | "updated_at">,
): Promise<void> {
  const items = await getPortalContent();
  const newItem: EventData = {
    ...event,
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "event",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await savePortalContent([newItem, ...items]);
}

export async function updateEvent(
  eventId: string,
  updates: Partial<Omit<EventData, "id" | "type" | "created_at">>,
): Promise<void> {
  const items = await getPortalContent();
  const updated = items.map((item) =>
    item.id === eventId && item.type === "event"
      ? { ...item, ...updates, updated_at: new Date().toISOString() }
      : item,
  );
  await savePortalContent(updated);
}

export async function deleteEvent(
  eventId: string,
): Promise<void> {
  const items = await getPortalContent();
  await savePortalContent(
    items.filter((item) => item.id !== eventId),
  );
}
