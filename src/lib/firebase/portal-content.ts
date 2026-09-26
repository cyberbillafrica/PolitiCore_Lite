// src/lib/firebase/portal-content.ts

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import { CURRENT_TENANT_ID } from "./tenants";
import type {
  PortalContent,
  PortalContentData,
  Announcement,
  EventData,
} from "@/types";

const COLLECTION = "portal_content";
const DEFAULT_ID = CURRENT_TENANT_ID;

export async function getPortalContent(
  tenantId?: string,
): Promise<PortalContent[]> {
  const id = tenantId || DEFAULT_ID;
  try {
    const ref = doc(db, COLLECTION, id);
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
  tenantId?: string,
): Promise<void> {
  const id = tenantId || DEFAULT_ID;
  const ref = doc(db, COLLECTION, id);
  await setDoc(
    ref,
    {
      tenant_id: id,
      items,
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
}

// ─── ANNOUNCEMENTS ───

export async function getAnnouncements(
  tenantId?: string,
): Promise<Announcement[]> {
  const items = await getPortalContent(tenantId);
  return items.filter(
    (item): item is Announcement => item.type === "announcement",
  );
}

export async function addAnnouncement(
  announcement: Omit<Announcement, "id" | "created_at" | "updated_at">,
  tenantId?: string,
): Promise<void> {
  const items = await getPortalContent(tenantId);
  const newItem: Announcement = {
    ...announcement,
    id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "announcement",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await savePortalContent([newItem, ...items], tenantId);
}

export async function updateAnnouncement(
  announcementId: string,
  updates: Partial<Omit<Announcement, "id" | "type" | "created_at">>,
  tenantId?: string,
): Promise<void> {
  const items = await getPortalContent(tenantId);
  const updated = items.map((item) =>
    item.id === announcementId && item.type === "announcement"
      ? { ...item, ...updates, updated_at: new Date().toISOString() }
      : item,
  );
  await savePortalContent(updated, tenantId);
}

export async function deleteAnnouncement(
  announcementId: string,
  tenantId?: string,
): Promise<void> {
  const items = await getPortalContent(tenantId);
  await savePortalContent(
    items.filter((item) => item.id !== announcementId),
    tenantId,
  );
}

// ─── EVENT ───

export async function getPublishedEvents(
  tenantId?: string,
): Promise<EventData[]> {
  const items = await getPortalContent(tenantId);
  return items
    .filter(
      (item): item is EventData =>
        item.type === "event" && item.status === "published",
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function addEvent(
  event: Omit<EventData, "id" | "type" | "created_at" | "updated_at">,
  tenantId?: string,
): Promise<void> {
  const items = await getPortalContent(tenantId);
  const newItem: EventData = {
    ...event,
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "event",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await savePortalContent([newItem, ...items], tenantId);
}

export async function updateEvent(
  eventId: string,
  updates: Partial<Omit<EventData, "id" | "type" | "created_at">>,
  tenantId?: string,
): Promise<void> {
  const items = await getPortalContent(tenantId);
  const updated = items.map((item) =>
    item.id === eventId && item.type === "event"
      ? { ...item, ...updates, updated_at: new Date().toISOString() }
      : item,
  );
  await savePortalContent(updated, tenantId);
}

export async function deleteEvent(
  eventId: string,
  tenantId?: string,
): Promise<void> {
  const items = await getPortalContent(tenantId);
  await savePortalContent(
    items.filter((item) => item.id !== eventId),
    tenantId,
  );
}

