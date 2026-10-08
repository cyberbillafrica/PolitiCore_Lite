import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { db } from "./config";
import { getAnnouncements as getPortalAnnouncements } from "./portal-content";
import { isTaskExpired } from "@/lib/date-utils";
import { REFERRAL_BONUS_POINTS } from "@/lib/social-config";

// ============================================================
// ORGANIZATIONAL ASSIGNMENTS
// ============================================================

import type {
  Announcement,
  ElectionResultRecord,
  OrganizationalAssignment,
} from "@/types";

/**
 * Get all active organizational assignments for a user.
 *
 * Security rules already ensure that a normal user can only
 * read assignments belonging to themselves.
 */
export async function getUserOrganizationalAssignments(
  userId: string,
): Promise<OrganizationalAssignment[]> {
  const q = query(
    collection(db, "organizational_assignments"),
    where("user_id", "==", userId),
    where("status", "==", "active"),
  );

  const snap = await getDocs(q);

  return snap.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  })) as OrganizationalAssignment[];
}

// ─────────────────────────────────────────────
// User
// ─────────────────────────────────────────────

export async function getAllUsers() {
  const q = query(collection(db, "users"), orderBy("created_at", "desc"));

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

// ─────────────────────────────────────────────
// Relational Organizing & Referrals
// ─────────────────────────────────────────────

/**
 * Resolves a referral code to the referrer's user ID.
 */
export async function resolveReferral(code: string): Promise<string | null> {
  if (!code || !code.trim()) return null;
  const cleanCode = code.trim().toUpperCase();

  const q = query(
    collection(db, "users"),
    where("referral_code", "==", cleanCode),
    limit(1),
  );

  const snap = await getDocs(q);
  if (!snap.empty) {
    return snap.docs[0].id;
  }

  // Fallback: check if code is a truncated user ID prefix
  const allSnap = await getDocs(collection(db, "users"));
  for (const d of allSnap.docs) {
    if (d.id.substring(0, 8).toUpperCase() === cleanCode) {
      return d.id;
    }
  }

  return null;
}

/**
 * Gets all members referred by a user.
 */
export async function getUserReferrals(userId: string) {
  const q = query(
    collection(db, "users"),
    where("referred_by", "==", userId),
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

// ─────────────────────────────────────────────
// Sub-teams (Phase 2 Scaffold - Feature Flagged)
// ─────────────────────────────────────────────

export interface SubTeamDoc {
  id?: string;
  name: string;
  owner_id: string;
  member_ids: string[];
  join_code: string;
  created_at?: unknown;
}

export async function createTeam(name: string, ownerId: string): Promise<string> {
  const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const teamRef = await addDoc(collection(db, "teams"), {
    name: name.trim(),
    owner_id: ownerId,
    member_ids: [ownerId],
    join_code: joinCode,
    created_at: serverTimestamp(),
  });

  // Link team to user
  await updateDoc(doc(db, "users", ownerId), {
    team_id: teamRef.id,
    updated_at: serverTimestamp(),
  });

  return teamRef.id;
}

export async function joinTeamByCode(joinCode: string, userId: string) {
  const cleanCode = joinCode.trim().toUpperCase();
  const q = query(
    collection(db, "teams"),
    where("join_code", "==", cleanCode),
    limit(1),
  );

  const snap = await getDocs(q);
  if (snap.empty) {
    throw new Error("Invalid team join code.");
  }

  const teamDoc = snap.docs[0];
  const teamData = teamDoc.data();
  const memberIds: string[] = teamData.member_ids || [];

  if (!memberIds.includes(userId)) {
    memberIds.push(userId);
    await updateDoc(teamDoc.ref, {
      member_ids: memberIds,
      updated_at: serverTimestamp(),
    });
  }

  await updateDoc(doc(db, "users", userId), {
    team_id: teamDoc.id,
    updated_at: serverTimestamp(),
  });
}

export async function getUserProfile(userId: string) {
  const snap = await getDoc(doc(db, "users", userId));

  return snap.exists()
    ? {
        id: snap.id,
        ...snap.data(),
      }
    : null;
}

export async function updateUserProfile(
  userId: string,
  data: Record<string, unknown>,
) {
  await updateDoc(doc(db, "users", userId), {
    ...data,
    updated_at: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────

export async function getActiveTasks() {
  const q = query(
    collection(db, "tasks"),
    where("status", "==", "active"),
    orderBy("created_at", "desc"),
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

export async function getAllTasks() {
  const q = query(collection(db, "tasks"), orderBy("created_at", "desc"));

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

export async function createTask(taskData: Record<string, unknown>) {
  const docRef = await addDoc(collection(db, "tasks"), {
    ...taskData,
    status: taskData.status || "active",
    created_at: serverTimestamp(),
  });

  return docRef.id;
}

export async function updateTask(
  taskId: string,
  payload: Record<string, unknown>,
) {
  const taskRef = doc(db, "tasks", taskId);
  await updateDoc(taskRef, {
    ...payload,
    updated_at: serverTimestamp(),
  });
}

export async function deleteTask(
  taskId: string,
  options: { mode: "soft" | "hard"; userId: string },
) {
  const taskRef = doc(db, "tasks", taskId);

  if (options.mode === "soft") {
    await updateDoc(taskRef, {
      status: "archived",
      archived_at: serverTimestamp(),
      archived_by: options.userId,
      updated_at: serverTimestamp(),
    });
  } else {
    // Hard delete: delete task and all its submissions in a batch write
    const q = query(
      collection(db, "task_submissions"),
      where("task_id", "==", taskId),
    );
    const snap = await getDocs(q);

    const batch = writeBatch(db);
    snap.docs.forEach((submissionDoc) => {
      batch.delete(submissionDoc.ref);
    });

    batch.delete(taskRef);
    await batch.commit();
  }
}

// ─────────────────────────────────────────────
// Task submissions
// ─────────────────────────────────────────────

/**
 * Creates a single submission for a member/task combination.
 *
 * IMPORTANT:
 * The document ID is deterministic:
 *
 *     {taskId}_{userId}
 *
 * This matches the Firestore Security Rules and prevents a member
 * from submitting the same task multiple times.
 *
 * Proof URL:
 * - Like       → not required
 * - Comment    → not required
 * - Share      → required
 * - Make post  → required
 */
export async function submitTaskCompletion(
  taskId: string,
  userId: string,
  proofUrl?: string,
) {
  const taskRef = doc(db, "tasks", taskId);
  const taskSnap = await getDoc(taskRef);

  if (!taskSnap.exists()) {
    throw new Error("Task not found");
  }

  const taskData = taskSnap.data();

  if (taskData.status !== "active") {
    throw new Error("This task is not currently active.");
  }

  if (isTaskExpired(taskData.deadline)) {
    throw new Error(
      "This task deadline has passed. Submissions are no longer accepted.",
    );
  }

  const submissionId = `${taskId}_${userId}`;

  const submissionRef = doc(db, "task_submissions", submissionId);

  await setDoc(submissionRef, {
    task_id: taskId,
    user_id: userId,
    proof_url: proofUrl?.trim() || null,
    status: "pending",
    source: "task",
    submitted_at: serverTimestamp(),
  });
}

/**
 * Gets all submissions for a specific task.
 *
 * Admin use only.
 *
 * Firestore has no joins, so we resolve each submitter's profile
 * individually.
 */
export async function getSubmissionsForTaskWithUsers(taskId: string) {
  const q = query(
    collection(db, "task_submissions"),
    where("task_id", "==", taskId),
    orderBy("submitted_at", "desc"),
  );

  const snap = await getDocs(q);

  const submissions = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as {
    id: string;
    user_id: string;
    [key: string]: unknown;
  }[];

  const withUsers = await Promise.all(
    submissions.map(async (submission) => {
      const user = await getUserProfile(submission.user_id);

      return {
        ...submission,
        user,
      };
    }),
  );

  return withUsers;
}

/**
 * Gets the current user's task submissions.
 */
export async function getUserTaskSubmissions(userId: string) {
  const q = query(
    collection(db, "task_submissions"),
    where("user_id", "==", userId),
    orderBy("submitted_at", "desc"),
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

/**
 * Verifies a task submission and awards the task points.
 *
 * Everything happens inside one Firestore transaction so that:
 *
 * 1. A submission cannot be verified twice.
 * 2. Points are only awarded once.
 * 3. The submission and user's points stay synchronized.
 */
export async function verifyTaskSubmission(
  submissionId: string,
  adminId: string,
) {
  await runTransaction(db, async (transaction) => {
    const submissionRef = doc(db, "task_submissions", submissionId);

    const submissionSnap = await transaction.get(submissionRef);

    if (!submissionSnap.exists()) {
      throw new Error("Submission not found");
    }

    const submissionData = submissionSnap.data();

    // Prevent double verification / double points.
    if (submissionData.status === "verified") {
      throw new Error("Submission has already been verified");
    }

    const taskId = submissionData.task_id;
    const userId = submissionData.user_id;

    if (!taskId || !userId) {
      throw new Error("Submission is missing task or user information");
    }

    const taskRef = doc(db, "tasks", taskId);

    const taskSnap = await transaction.get(taskRef);

    if (!taskSnap.exists()) {
      throw new Error("Task not found");
    }

    const taskData = taskSnap.data();
    const points = Number(taskData.points ?? 0);

    if (points <= 0) {
      throw new Error("This task does not have valid points assigned");
    }

    const userRef = doc(db, "users", userId);

    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists()) {
      throw new Error("Member profile not found");
    }

    // Mark submission verified.
    transaction.update(submissionRef, {
      status: "verified",
      verified_at: serverTimestamp(),
      verified_by: adminId,
    });

    // Award points exactly once.
    const userUpdate: Record<string, unknown> = {
      points: increment(points),
      updated_at: serverTimestamp(),
    };

    const userData = userSnap.data();
    const referredBy = userData.referred_by as string | undefined;
    const hasCompletedFirstTask = userData.has_completed_first_task as boolean | undefined;

    if (referredBy && !hasCompletedFirstTask) {
      userUpdate.has_completed_first_task = true;

      const referrerRef = doc(db, "users", referredBy);
      const referrerSnap = await transaction.get(referrerRef);

      if (referrerSnap.exists()) {
        transaction.update(referrerRef, {
          points: increment(REFERRAL_BONUS_POINTS),
          updated_at: serverTimestamp(),
        });

        // Log referral bonus submission so it shows up in analytics & user history
        const referralSubRef = doc(collection(db, "task_submissions"));
        transaction.set(referralSubRef, {
          task_id: `referral_${userId}`,
          user_id: referredBy,
          status: "verified",
          source: "referral_bonus",
          submitted_at: serverTimestamp(),
          verified_at: serverTimestamp(),
          verified_by: adminId,
          referred_user_id: userId,
          referred_user_name: userData.full_name || "Referred Member",
        });
      }
    }

    transaction.update(userRef, userUpdate);
  });
}

// ─────────────────────────────────────────────
// Leaderboard
// ─────────────────────────────────────────────

export async function getLeaderboard(topN: number = 50) {
  const q = query(
    collection(db, "users"),
    orderBy("points", "desc"),
    limit(topN),
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

// ─────────────────────────────────────────────
// News
// ─────────────────────────────────────────────

import type { NewsArticle, NewsStatus } from "@/types";

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Normalizes Firestore news document data into a consistent NewsArticle interface.
 * Handles legacy documents that use `published: boolean`.
 */
export function normalizeNewsArticle(
  id: string,
  data: Record<string, unknown>,
): NewsArticle {
  const status: NewsStatus =
    (data.status as NewsStatus) || (data.published ? "published" : "draft");

  return {
    id,
    title: (data.title as string) || "Untitled Article",
    slug: (data.slug as string) || generateSlug((data.title as string) || id),
    excerpt: (data.excerpt as string) || "",
    content: (data.content as string) || "",
    featured_image: (data.featured_image as string) ?? null,
    category: (data.category as string) ?? null,
    status,
    published: status === "published",
    published_at: data.published_at ?? data.created_at ?? null,
    scheduled_at: data.scheduled_at ?? null,
    author: (data.author as string) ?? null,
    created_by: (data.created_by as string) || "",
    updated_by: (data.updated_by as string) ?? null,
    created_at: data.created_at ?? null,
    updated_at: data.updated_at ?? null,
  };
}

export async function getPublishedNews(
  limitCount: number = 20,
): Promise<NewsArticle[]> {
  // Simple equality queries without orderBy to avoid requiring Firestore composite indexes
  const qStatus = query(
    collection(db, "news"),
    where("status", "==", "published"),
    limit(limitCount * 2),
  );

  const qLegacy = query(
    collection(db, "news"),
    where("published", "==", true),
    limit(limitCount * 2),
  );

  try {
    const [snapStatus, snapLegacy] = await Promise.all([
      getDocs(qStatus).catch(() => ({ docs: [] })),
      getDocs(qLegacy).catch(() => ({ docs: [] })),
    ]);

    const articlesMap = new Map<string, NewsArticle>();

    for (const d of snapStatus.docs) {
      articlesMap.set(d.id, normalizeNewsArticle(d.id, d.data()));
    }

    for (const d of snapLegacy.docs) {
      if (!articlesMap.has(d.id)) {
        articlesMap.set(d.id, normalizeNewsArticle(d.id, d.data()));
      }
    }

    const articles = Array.from(articlesMap.values());
    articles.sort((a, b) => {
      const timeA = (a.created_at as { seconds?: number })?.seconds || 0;
      const timeB = (b.created_at as { seconds?: number })?.seconds || 0;
      return timeB - timeA;
    });

    return articles.slice(0, limitCount);
  } catch (error) {
    console.error("Error fetching published news:", error);
    return [];
  }
}

export async function getAllNewsArticles(): Promise<NewsArticle[]> {
  const q = query(collection(db, "news"), orderBy("created_at", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeNewsArticle(d.id, d.data()));
}

export async function getNewsArticle(id: string): Promise<NewsArticle | null> {
  const snap = await getDoc(doc(db, "news", id));
  if (!snap.exists()) return null;
  return normalizeNewsArticle(snap.id, snap.data());
}

export async function getNewsArticleBySlug(
  slug: string,
): Promise<NewsArticle | null> {
  // Query status == published or legacy published == true
  const qStatus = query(
    collection(db, "news"),
    where("slug", "==", slug),
    where("status", "==", "published"),
    limit(1),
  );

  const qLegacy = query(
    collection(db, "news"),
    where("slug", "==", slug),
    where("published", "==", true),
    limit(1),
  );

  const [snapStatus, snapLegacy] = await Promise.all([
    getDocs(qStatus).catch(() => ({ docs: [], empty: true })),
    getDocs(qLegacy).catch(() => ({ docs: [], empty: true })),
  ]);

  const docData = snapStatus.docs[0] || snapLegacy.docs[0];
  if (!docData) return null;

  return normalizeNewsArticle(docData.id, docData.data());
}

export async function createNewsArticle(
  articleData: Omit<NewsArticle, "id" | "created_at" | "updated_at">,
): Promise<string> {
  const docData: Record<string, unknown> = {
    title: articleData.title,
    slug: articleData.slug || generateSlug(articleData.title),
    excerpt: articleData.excerpt || "",
    content: articleData.content || "",
    featured_image: articleData.featured_image || null,
    category: articleData.category || null,
    status: articleData.status || "draft",
    published: articleData.status === "published",
    published_at:
      articleData.status === "published"
        ? serverTimestamp()
        : articleData.published_at || null,
    scheduled_at: articleData.scheduled_at || null,
    author: articleData.author || null,
    created_by: articleData.created_by || "",
    updated_by: articleData.updated_by || null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, "news"), docData);
  return docRef.id;
}

export async function updateNewsArticle(
  id: string,
  articleData: Partial<NewsArticle>,
): Promise<void> {
  const updateData: Record<string, unknown> = {
    updated_at: serverTimestamp(),
  };

  if (articleData.title !== undefined) updateData.title = articleData.title;
  if (articleData.slug !== undefined) updateData.slug = articleData.slug;
  if (articleData.excerpt !== undefined)
    updateData.excerpt = articleData.excerpt;
  if (articleData.content !== undefined)
    updateData.content = articleData.content;
  if (articleData.featured_image !== undefined)
    updateData.featured_image = articleData.featured_image;
  if (articleData.category !== undefined)
    updateData.category = articleData.category;
  if (articleData.author !== undefined) updateData.author = articleData.author;
  if (articleData.updated_by !== undefined)
    updateData.updated_by = articleData.updated_by;
  if (articleData.scheduled_at !== undefined)
    updateData.scheduled_at = articleData.scheduled_at;

  if (articleData.status !== undefined) {
    updateData.status = articleData.status;
    updateData.published = articleData.status === "published";
    if (articleData.status === "published" && !articleData.published_at) {
      updateData.published_at = serverTimestamp();
    }
  }

  await updateDoc(doc(db, "news", id), updateData);
}

export async function deleteNewsArticle(id: string): Promise<void> {
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(db, "news", id));
}

/**
 * Get announcements for the current organization, filtered by user scope
 */
export async function getUserAnnouncements(
  userProfile: any,
): Promise<Announcement[]> {
  const allAnnouncements = await getPortalAnnouncements();

  // Filter by scope
  return allAnnouncements.filter((announcement) => {
    if (announcement.scope === "general") return true;
    if (announcement.scope === "admins" && userProfile?.access_role === "admin")
      return true;
    if (
      announcement.scope === "campaign_members" &&
      userProfile?.membership_types?.includes("campaign_member")
    )
      return true;
    if (
      announcement.scope === "social_members" &&
      userProfile?.membership_types?.includes("social_member")
    )
      return true;
    if (
      announcement.scope === "election_officers" &&
      userProfile?.access_role === "election_officer"
    )
      return true;
    return false;
  });
}

// ─────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────

export async function getUpcomingEvents() {
  const today = new Date().toISOString().split("T")[0];

  const q = query(
    collection(db, "events"),
    where("date", ">=", today),
    orderBy("date", "asc"),
    limit(5),
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

// ─────────────────────────────────────────────
// Election results
// ─────────────────────────────────────────────

export interface ElectionResult {
  party: string;
  votes: number;
}

export function deriveLgaIdFromWardId(wardId: string): string {
  if (!wardId) return wardId;

  const match = wardId.match(/^(.*)-ward-[^-]+$/);
  return match ? match[1] : wardId;
}

export async function getAllElectionResults(): Promise<ElectionResultRecord[]> {
  const q = query(
    collection(db, "election_results"),
    orderBy("created_at", "desc"),
  );

  const snap = await getDocs(q);

  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<ElectionResultRecord, "id">),
  }));
}

export async function getElectionResultsByPollingUnit(
  pollingUnitId: string,
): Promise<ElectionResultRecord[]> {
  const q = query(
    collection(db, "election_results"),
    where("polling_unit_id", "==", pollingUnitId),
    orderBy("created_at", "desc"),
  );

  const snap = await getDocs(q);

  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<ElectionResultRecord, "id">),
  }));
}

export async function getElectionResultsByWard(
  wardId: string,
): Promise<ElectionResultRecord[]> {
  const q = query(
    collection(db, "election_results"),
    where("ward_id", "==", wardId),
    orderBy("created_at", "desc"),
  );

  const snap = await getDocs(q);

  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<ElectionResultRecord, "id">),
  }));
}

export async function getElectionResultsByLga(
  lgaId: string,
): Promise<ElectionResultRecord[]> {
  const q = query(
    collection(db, "election_results"),
    where("lga_id", "==", lgaId),
    orderBy("created_at", "desc"),
  );

  const snap = await getDocs(q);

  return snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<ElectionResultRecord, "id">),
  }));
}

/**
 * Submits a polling unit's election results as a SINGLE document,
 * keyed by a deterministic ID derived from ward_id + polling_unit_id.
 *
 * Document ID:
 *
 *     {ward_id}__{polling_unit_id}
 *
 * Firestore Security Rules prevent a second submission for the
 * same polling unit.
 */
export async function submitElectionResult(
  pollingUnitId: string,
  wardId: string,
  results: ElectionResult[],
  userId: string,
) {
  const resultDocId = `${wardId}__${pollingUnitId}`;
  const lgaId = deriveLgaIdFromWardId(wardId);

  const resultRef = doc(db, "election_results", resultDocId);

  await setDoc(resultRef, {
    ward_id: wardId,
    lga_id: lgaId,
    polling_unit_id: pollingUnitId,
    results,
    submitted_by: userId,
    verified: false,
    created_at: serverTimestamp(),
  });
}

// ============================================================
// CONTACT MESSAGES
// ============================================================

export type ContactMessageStatus = "unread" | "read";

export interface ContactMessageDoc {
  id: string;

  name: string;
  email: string;
  phone?: string | null;
  message: string;

  status: ContactMessageStatus;

  created_at?: unknown;
}

/**
 * Get all contact messages submitted through the public site,
 * newest first.
 */
export async function getContactMessages(): Promise<ContactMessageDoc[]> {
  const q = query(
    collection(db, "contact_messages"),
    orderBy("created_at", "desc"),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<ContactMessageDoc, "id">),
  }));
}

/**
 * Mark a contact message as read.
 */
export async function markContactMessageAsRead(
  messageId: string,
): Promise<void> {
  await updateDoc(doc(db, "contact_messages", messageId), {
    status: "read",
  });
}
