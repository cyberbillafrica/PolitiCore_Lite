// src/lib/firebase/events.ts

import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./config";
import type { CampaignEvent } from "@/types";

/*
 * ============================================================
 * HOMEPAGE EVENTS
 * ============================================================
 *
 * Events live in their own collection (`events/{eventId}`), separate
 * from the `portal_content/main.items[]` announcements they used to
 * share a document with. The public homepage is the only reader; the
 * admin portal is the only writer.
 */

const COLLECTION = "events";

/** The writable shape of an event, exactly as the admin form collects it. */
export interface CampaignEventInput {
  title: string;
  description: string;
  /** "YYYY-MM-DD" from the admin date input. */
  date: string;
  time: string;
  venue: string;
  lga_id: string;
  ward_id: string;
  status: "draft" | "published";
}

/*
 * Local noon on the event day.
 *
 * Noon (not midnight) keeps the calendar day stable when the value
 * round-trips through a timezone other than the one that wrote it.
 */
export function eventDateToTimestamp(date: string): Timestamp {
  const [year, month, day] = date.split("-").map(Number);
  return Timestamp.fromDate(
    new Date(year, (month || 1) - 1, day || 1, 12, 0, 0),
  );
}

function toDateInputValue(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "YYYY-MM-DD" for the admin date input, from any stored date value. */
export function eventDateToInputValue(date: unknown): string {
  if (!date) return "";
  if (date instanceof Date) return toDateInputValue(date);
  if (typeof date === "string") return date.slice(0, 10);

  if (typeof date === "object" && date !== null) {
    const candidate = date as { toDate?: () => Date; seconds?: number };
    if (typeof candidate.toDate === "function") {
      return toDateInputValue(candidate.toDate());
    }
    if (typeof candidate.seconds === "number") {
      return toDateInputValue(new Date(candidate.seconds * 1000));
    }
  }

  return "";
}

/** Start of today, local time — the homepage "upcoming" lower bound. */
export function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function fromSnapshot(id: string, data: unknown): CampaignEvent {
  return { id, ...(data as Omit<CampaignEvent, "id">) };
}

export async function getEventById(id: string): Promise<CampaignEvent | null> {
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return fromSnapshot(snap.id, snap.data());
}

/** Every event (draft + published), newest first — the admin tab. */
export async function getAllEvents(): Promise<CampaignEvent[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), orderBy("date", "desc")),
  );
  return snap.docs.map((d) => fromSnapshot(d.id, d.data()));
}

/**
 * The homepage query: published events on or after today, ascending,
 * limited to `limitCount`.
 *
 * Requires the composite index `status ASC, date ASC`
 * (see firestore.indexes.json).
 */
export async function getPublishedUpcomingEvents(
  limitCount = 3,
): Promise<CampaignEvent[]> {
  const q = query(
    collection(db, COLLECTION),
    where("status", "==", "published"),
    where("date", ">=", Timestamp.fromDate(startOfToday())),
    orderBy("date", "asc"),
    limitTo(limitCount),
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => fromSnapshot(d.id, d.data()));
}

export async function createEvent(
  input: CampaignEventInput,
  createdBy?: string | null,
): Promise<string> {
  const docRef = await addDoc(collection(db, COLLECTION), {
    title: input.title,
    description: input.description,
    date: eventDateToTimestamp(input.date),
    time: input.time,
    venue: input.venue,
    lga_id: input.lga_id,
    ward_id: input.ward_id,
    status: input.status,
    created_by: createdBy ?? null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  return docRef.id;
}

export async function updateEvent(
  id: string,
  input: CampaignEventInput,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    title: input.title,
    description: input.description,
    date: eventDateToTimestamp(input.date),
    time: input.time,
    venue: input.venue,
    lga_id: input.lga_id,
    ward_id: input.ward_id,
    status: input.status,
    updated_at: serverTimestamp(),
  });
}

export async function deleteEvent(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
