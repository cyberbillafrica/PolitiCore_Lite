"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Edit2,
  ExternalLink,
  Loader2,
  Lock,
  Plus,
  Send,
  Share2,
  Trash2,
  X,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { isTaskExpired } from "@/lib/date-utils";
import { requiresProof } from "@/lib/social-config";
import type { TaskAction, TaskPlatform } from "@/types";

import {
  createTask,
  deleteTask,
  getActiveTasks,
  getAllTasks,
  getSubmissionsForTaskWithUsers,
  getUserTaskSubmissions,
  submitTaskCompletion,
  updateTask,
  verifyTaskSubmission,
} from "@/lib/firebase/firestore";

// --------------------------------------------------
// Types & Constants
// --------------------------------------------------

interface FirestoreTask {
  id: string;
  platform?: TaskPlatform;
  action?: TaskAction;
  points?: number;
  url?: string;
  deadline?: string | null;
  status?: string;
  created_at?: unknown;
  created_by?: string;
  updated_at?: unknown;
  updated_by?: string;
  archived_at?: unknown;
  archived_by?: string;
  [key: string]: unknown;
}

interface SubmissionWithUser {
  id: string;
  task_id: string;
  user_id: string;
  status: "pending" | "verified";
  proof_url?: string | null;
  submitted_at?: unknown;
  verified_at?: unknown;
  user: {
    id?: string;
    full_name?: string;
    facebook_username?: string;
    x_username?: string;
    instagram_username?: string;
    tiktok_username?: string;
    facebook_profile_url?: string;
    x_profile_url?: string;
    instagram_profile_url?: string;
    tiktok_profile_url?: string;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

interface UserSubmission {
  id: string;
  task_id: string;
  status: "pending" | "verified";
  proof_url?: string | null;
  submitted_at?: unknown;
  [key: string]: unknown;
}

const PLATFORM_OPTIONS: TaskPlatform[] = [
  "Facebook",
  "X",
  "Instagram",
  "TikTok",
];

const ACTION_OPTIONS: TaskAction[] = [
  "Like",
  "Comment",
  "Like and Comment",
  "Share",
  "Comment and Share",
  "Make Post",
];

const PLATFORM_NAME_FIELD: Record<TaskPlatform, string> = {
  Facebook: "facebook_username",
  X: "x_username",
  Instagram: "instagram_username",
  TikTok: "tiktok_username",
};

const PLATFORM_PROFILE_FIELD: Record<TaskPlatform, string> = {
  Facebook: "facebook_profile_url",
  X: "x_profile_url",
  Instagram: "instagram_profile_url",
  TikTok: "tiktok_profile_url",
};


function getActionHelpText(action?: TaskAction | string) {
  switch (action) {
    case "Like":
      return "Open the post, click Like, then mark the task completed. No proof URL is required.";
    case "Comment":
      return "Open the post, leave a comment, then mark the task completed. No proof URL is required.";
    case "Like and Comment":
      return "Open the post, click Like and leave a comment, then mark the task completed. No proof URL is required.";
    case "Share":
      return "Open the post, share it to your timeline/profile, then paste the direct link to your shared post below.";
    case "Comment and Share":
      return "Open the post, leave a comment, share it to your timeline, then paste the direct link to your shared post below.";
    case "Make Post":
      return "Create a new post on your profile supporting the candidate, then paste the direct link to your post below.";
    default:
      return "Complete the specified action and submit proof if required.";
  }
}

function getMemberSocialName(
  user: SubmissionWithUser["user"],
  platform?: TaskPlatform,
) {
  if (!user || !platform) return null;
  const field = PLATFORM_NAME_FIELD[platform];
  return field ? ((user[field] as string | undefined) ?? null) : null;
}

function getMemberProfileUrl(
  user: SubmissionWithUser["user"],
  platform?: TaskPlatform,
) {
  if (!user || !platform) return null;
  const field = PLATFORM_PROFILE_FIELD[platform];
  return field ? ((user[field] as string | undefined) ?? null) : null;
}

function formatDate(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date })
      .toDate()
      .toLocaleDateString("en-NG", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
  }
  return "Recently";
}

// --------------------------------------------------
// Page Component
// --------------------------------------------------

export default function TasksPage() {
  const { profile, loading: authLoading } = useAuth();

  const isAdmin = profile?.access_role === "admin";
  const isMember = profile?.access_role === "member";

  // Shared task state
  const [tasks, setTasks] = useState<FirestoreTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showClosedTasks, setShowClosedTasks] = useState(false);

  // Admin create/edit form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [successToast, setSuccessToast] = useState("");

  const [createForm, setCreateForm] = useState({
    platform: "Facebook" as TaskPlatform,
    action: "Like" as TaskAction,
    points: "",
    url: "",
    deadline: "",
    status: "active",
  });

  // Admin delete modal state
  const [deleteTarget, setDeleteTarget] = useState<FirestoreTask | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSubmissionsCount, setDeleteSubmissionsCount] = useState<number | null>(null);

  // Admin submissions state
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [submissionsByTask, setSubmissionsByTask] = useState<
    Record<string, SubmissionWithUser[]>
  >({});
  const [loadingSubmissionsFor, setLoadingSubmissionsFor] = useState<string | null>(null);
  const [submissionsError, setSubmissionsError] = useState("");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Member submission state
  const [mySubmissions, setMySubmissions] = useState<UserSubmission[]>([]);
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});
  const [memberError, setMemberError] = useState("");

  // Referral / Invite state
  const [copiedReferral, setCopiedReferral] = useState(false);

  // Load tasks
  const loadTasks = async () => {
    if (!profile) return;
    setLoadingTasks(true);
    setLoadError("");

    try {
      const data = isAdmin ? await getAllTasks() : await getActiveTasks();
      // Filter out archived tasks unless explicitly in admin view
      const filtered = (data as FirestoreTask[]).filter(
        (t) => t.status !== "archived",
      );
      setTasks(filtered);
    } catch (error) {
      console.error("Failed to load tasks:", error);
      setLoadError("Unable to load tasks right now.");
    } finally {
      setLoadingTasks(false);
    }
  };

  // Load member submissions
  const loadMySubmissions = async () => {
    if (!profile?.id || !isMember) return;
    try {
      const data = await getUserTaskSubmissions(profile.id);
      setMySubmissions(data as UserSubmission[]);
    } catch (error) {
      console.error("Failed to load your submissions:", error);
      setMemberError("Unable to load your task history right now.");
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    loadTasks();
    if (isMember) {
      loadMySubmissions();
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile?.id, profile?.access_role]);

  // Submission lookup helper
  const getSubmissionForTask = (taskId: string) => {
    return mySubmissions.find((submission) => submission.task_id === taskId);
  };

  // Open Edit Mode
  const handleStartEdit = (task: FirestoreTask) => {
    setEditingTaskId(task.id);
    setCreateForm({
      platform: (task.platform as TaskPlatform) || "Facebook",
      action: (task.action as TaskAction) || "Like",
      points: String(task.points ?? ""),
      url: task.url || "",
      deadline: task.deadline || "",
      status: task.status || "active",
    });
    setCreateError("");
    setShowCreateForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelForm = () => {
    setShowCreateForm(false);
    setEditingTaskId(null);
    setCreateError("");
    setCreateForm({
      platform: "Facebook",
      action: "Like",
      points: "",
      url: "",
      deadline: "",
      status: "active",
    });
  };

  // Admin Save (Create or Update)
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !profile?.id) return;

    setCreateError("");
    const pointsNumber = Number(createForm.points);

    if (!createForm.url.trim()) {
      setCreateError("The original post URL is required.");
      return;
    }

    if (!pointsNumber || pointsNumber <= 0) {
      setCreateError("Points must be a positive number.");
      return;
    }

    setCreating(true);

    try {
      const payload = {
        platform: createForm.platform,
        action: createForm.action,
        points: pointsNumber,
        url: createForm.url.trim(),
        deadline: createForm.deadline || null,
        status: createForm.status || "active",
      };

      if (editingTaskId) {
        await updateTask(editingTaskId, {
          ...payload,
          updated_by: profile.id,
        });
        setSuccessToast("Task updated successfully!");
      } else {
        await createTask({
          ...payload,
          created_by: profile.id,
        });
        setSuccessToast("New task created successfully!");
      }

      handleCancelForm();
      await loadTasks();

      setTimeout(() => setSuccessToast(""), 4000);
    } catch (error: unknown) {
      console.error("Failed to save task:", error);
      setCreateError(
        error instanceof Error
          ? error.message
          : "Failed to save task. Please try again.",
      );
    } finally {
      setCreating(false);
    }
  };

  // Open Delete Confirmation Dialog
  const handlePromptDelete = async (task: FirestoreTask) => {
    setDeleteTarget(task);
    setDeleteSubmissionsCount(null);

    try {
      const subs = await getSubmissionsForTaskWithUsers(task.id);
      setDeleteSubmissionsCount(subs.length);
    } catch {
      setDeleteSubmissionsCount(0);
    }
  };

  // Perform Delete (Soft or Hard)
  const handleConfirmDelete = async (mode: "soft" | "hard") => {
    if (!deleteTarget || !isAdmin || !profile?.id) return;

    setDeleting(true);
    try {
      await deleteTask(deleteTarget.id, { mode, userId: profile.id });
      setDeleteTarget(null);
      setSuccessToast(
        mode === "soft"
          ? "Task archived successfully."
          : "Task permanently deleted.",
      );
      await loadTasks();
      setTimeout(() => setSuccessToast(""), 4000);
    } catch (error) {
      console.error("Delete failed:", error);
      setLoadError("Failed to delete task. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  // Toggle Submissions Drawer
  const toggleSubmissions = async (taskId: string) => {
    if (!isAdmin) return;
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
      return;
    }

    setExpandedTaskId(taskId);
    setSubmissionsError("");

    if (submissionsByTask[taskId]) {
      return;
    }

    setLoadingSubmissionsFor(taskId);
    try {
      const data = await getSubmissionsForTaskWithUsers(taskId);
      setSubmissionsByTask((prev) => ({
        ...prev,
        [taskId]: data as SubmissionWithUser[],
      }));
    } catch (error) {
      console.error("Failed to load submissions:", error);
      setSubmissionsError("Unable to load submissions for this task.");
    } finally {
      setLoadingSubmissionsFor(null);
    }
  };

  // Verify Submission
  const handleVerify = async (taskId: string, submissionId: string) => {
    if (!isAdmin || !profile?.id) return;
    setSubmissionsError("");
    setVerifyingId(submissionId);

    try {
      await verifyTaskSubmission(submissionId, profile.id);
      setSubmissionsByTask((prev) => ({
        ...prev,
        [taskId]: (prev[taskId] ?? []).map((sub) =>
          sub.id === submissionId ? { ...sub, status: "verified" } : sub,
        ),
      }));
    } catch (error: unknown) {
      console.error("Failed to verify submission:", error);
      setSubmissionsError(
        error instanceof Error
          ? error.message
          : "Verification failed. Please try again.",
      );
    } finally {
      setVerifyingId(null);
    }
  };

  // Member Submit Completion
  const handleSubmitCompletion = async (task: FirestoreTask) => {
    if (!isMember || !profile?.id) return;

    setMemberError("");
    const existing = getSubmissionForTask(task.id);
    if (existing) {
      setMemberError("You have already submitted this task.");
      return;
    }

    if (isTaskExpired(task.deadline)) {
      setMemberError("This task deadline has passed and is no longer accepting submissions.");
      return;
    }

    const needsProof = requiresProof(task.action);
    const proofUrl = proofUrls[task.id]?.trim() ?? "";

    if (needsProof && !proofUrl) {
      setMemberError(
        task.action === "Make Post"
          ? "Please provide the direct URL to your post."
          : "Please provide the direct URL to your shared post.",
      );
      return;
    }

    setSubmittingTaskId(task.id);

    try {
      await submitTaskCompletion(
        task.id,
        profile.id,
        needsProof ? proofUrl : undefined,
      );

      const updated = await getUserTaskSubmissions(profile.id);
      setMySubmissions(updated as UserSubmission[]);
      setProofUrls((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
      setSuccessToast("Task submitted successfully for review!");
      setTimeout(() => setSuccessToast(""), 4000);
    } catch (error: unknown) {
      console.error("Failed to submit task:", error);
      setMemberError(
        error instanceof Error
          ? error.message
          : "Unable to submit task. Please try again.",
      );
    } finally {
      setSubmittingTaskId(null);
    }
  };

  // Referral code helper
  const referralCode = profile?.referral_code || profile?.id?.slice(0, 8).toUpperCase() || "";
  const referralLink = typeof window !== "undefined"
    ? `${window.location.origin}/login?ref=${referralCode}`
    : `https://politicore.org/login?ref=${referralCode}`;

  const handleCopyReferral = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(referralLink);
      setCopiedReferral(true);
      setTimeout(() => setCopiedReferral(false), 3000);
    }
  };

  const handleShareReferral = () => {
    if (navigator.share) {
      navigator.share({
        title: "Join PolitiCore Campaign",
        text: "Join me on PolitiCore to support our campaign and earn social points!",
        url: referralLink,
      }).catch(() => handleCopyReferral());
    } else {
      handleCopyReferral();
    }
  };

  // Separate active vs closed tasks
  const activeTasks = tasks.filter((t) => !isTaskExpired(t.deadline));
  const closedTasks = tasks.filter((t) => isTaskExpired(t.deadline));

  if (authLoading || !profile) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading tasks…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-20">
      {/* --------------------------------------------
          Header
      --------------------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Social Tasks</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {isAdmin
              ? "Manage social media tasks, review proof submissions, and analyze engagement."
              : "Complete social tasks, earn points, and climb the leaderboard."}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link
              href="/portal/admin/analytics"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <BarChart2 className="h-4 w-4 text-emerald-600" />
              Analytics
            </Link>

            <button
              type="button"
              onClick={() => {
                if (showCreateForm) {
                  handleCancelForm();
                } else {
                  setShowCreateForm(true);
                  setEditingTaskId(null);
                }
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-apc-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-apc-dark shadow-xs"
            >
              {showCreateForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showCreateForm ? "Cancel" : "Create Task"}
            </button>
          </div>
        )}
      </div>

      {/* --------------------------------------------
          Admin KPI Strip
      --------------------------------------------- */}
      {isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Tasks</p>
            <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{tasks.length}</p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Tasks</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{activeTasks.length}</p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Closed Tasks</p>
            <p className="text-2xl font-black text-amber-600 mt-1">{closedTasks.length}</p>
          </div>
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-800 to-teal-900 text-white shadow-xs flex flex-col justify-between">
            <p className="text-xs font-bold text-emerald-200 uppercase tracking-wide">Social Analytics</p>
            <Link
              href="/portal/admin/analytics"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-extrabold text-white hover:underline"
            >
              View Full Dashboard &rarr;
            </Link>
          </div>
        </div>
      )}

      {/* --------------------------------------------
          Toast & Errors
      --------------------------------------------- */}
      {successToast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200 shadow-xs">
          {successToast}
        </div>
      )}

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-xs">
          {loadError}
        </div>
      )}

      {memberError && !isAdmin && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-xs">
          {memberError}
        </div>
      )}

      {/* --------------------------------------------
          Referral Invite Surface for Members
      --------------------------------------------- */}
      {isMember && (
        <Card className="bg-gradient-to-r from-teal-900 via-emerald-800 to-emerald-900 text-white border-0 shadow-lg overflow-hidden">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-emerald-200 border border-white/10">
                  <Share2 className="h-3.5 w-3.5" /> Invite Supporters & Earn Points
                </div>
                <h3 className="text-lg font-extrabold text-white">Relational Organizing Link</h3>
                <p className="text-xs text-emerald-100/90 leading-relaxed max-w-xl">
                  Share your referral link with fellow supporters. Earn <strong>100 bonus points</strong> when they complete their first verified social task!
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyReferral}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-emerald-900 font-bold text-xs hover:bg-emerald-50 transition-colors"
                >
                  {copiedReferral ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  {copiedReferral ? "Copied Link!" : "Copy Link"}
                </button>

                <button
                  type="button"
                  onClick={handleShareReferral}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-600 transition-colors border border-emerald-500/30"
                >
                  <Share2 className="h-4 w-4" /> Share
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* --------------------------------------------
          ADMIN CREATE / EDIT TASK FORM
      --------------------------------------------- */}
      {isAdmin && showCreateForm && (
        <Card className="border border-emerald-200 dark:border-emerald-800 shadow-md">
          <CardHeader className="border-b bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardTitle className="text-lg font-extrabold text-emerald-900 dark:text-emerald-200">
              {editingTaskId ? "Edit Social Task" : "Create New Social Task"}
            </CardTitle>
          </CardHeader>

          <CardContent className="p-6">
            <form onSubmit={handleSaveTask} className="space-y-5">
              {createError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {createError}
                </div>
              )}

              <div className="grid gap-5 md:grid-cols-2">
                {/* Platform */}
                <div>
                  <label className="mb-2 block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                    Platform *
                  </label>
                  <select
                    value={createForm.platform}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        platform: e.target.value as TaskPlatform,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-base sm:text-sm font-medium focus:ring-2 focus:ring-emerald-500"
                  >
                    {PLATFORM_OPTIONS.map((platform) => (
                      <option key={platform} value={platform}>
                        {platform}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Action */}
                <div>
                  <label className="mb-2 block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                    Action *
                  </label>
                  <select
                    value={createForm.action}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        action: e.target.value as TaskAction,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-base sm:text-sm font-medium focus:ring-2 focus:ring-emerald-500"
                  >
                    {ACTION_OPTIONS.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Points */}
                <div>
                  <label className="mb-2 block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                    Points *
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    required
                    value={createForm.points}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        points: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-base sm:text-sm font-medium focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g. 50"
                  />
                </div>

                {/* Deadline */}
                <div>
                  <label className="mb-2 block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                    Deadline (Optional)
                  </label>
                  <input
                    type="date"
                    value={createForm.deadline}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        deadline: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-base sm:text-sm font-medium focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="mt-1 text-[11px] text-gray-500">
                    Expires at 23:59:59 WAT on date. Leave blank for no deadline.
                  </p>
                </div>

                {/* Status */}
                <div>
                  <label className="mb-2 block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                    Status
                  </label>
                  <select
                    value={createForm.status}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        status: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-base sm:text-sm font-medium focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                {/* Original post URL */}
                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                    Original Post URL *
                  </label>
                  <input
                    type="url"
                    inputMode="url"
                    required
                    value={createForm.url}
                    onChange={(e) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        url: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-base sm:text-sm font-medium focus:ring-2 focus:ring-emerald-500"
                    placeholder="https://facebook.com/..."
                  />
                  <p className="mt-1 text-[11px] text-gray-500">
                    {getActionHelpText(createForm.action)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCancelForm}
                  className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-bold text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-6 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {creating
                    ? "Saving..."
                    : editingTaskId
                      ? "Save Changes"
                      : "Create Task"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* --------------------------------------------
          ACTIVE TASK LIST
      --------------------------------------------- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-bold">
            {isAdmin ? "Active & Pending Tasks" : "Available Tasks"}
          </CardTitle>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
            {activeTasks.length} Available
          </span>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {loadingTasks ? (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading tasks…
            </div>
          ) : activeTasks.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">
                No active social tasks available right now.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeTasks.map((task) => (
                <TaskCardItem
                  key={task.id}
                  task={task}
                  isAdmin={isAdmin}
                  isMember={isMember}
                  expandedTaskId={expandedTaskId}
                  toggleSubmissions={toggleSubmissions}
                  handleStartEdit={handleStartEdit}
                  handlePromptDelete={handlePromptDelete}
                  getSubmissionForTask={getSubmissionForTask}
                  proofUrls={proofUrls}
                  setProofUrls={setProofUrls}
                  handleSubmitCompletion={handleSubmitCompletion}
                  submittingTaskId={submittingTaskId}
                  loadingSubmissionsFor={loadingSubmissionsFor}
                  submissionsByTask={submissionsByTask}
                  submissionsError={submissionsError}
                  handleVerify={handleVerify}
                  verifyingId={verifyingId}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* --------------------------------------------
          CLOSED TASKS SECTION (COLLAPSED BY DEFAULT)
      --------------------------------------------- */}
      {closedTasks.length > 0 && (
        <Card className="border-gray-200 dark:border-gray-800">
          <CardHeader className="cursor-pointer" onClick={() => setShowClosedTasks((prev) => !prev)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-600" />
                <CardTitle className="text-base font-bold text-gray-800 dark:text-gray-200">
                  Closed Tasks ({closedTasks.length})
                </CardTitle>
              </div>

              <button type="button" className="text-gray-500 hover:text-gray-700">
                {showClosedTasks ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
            </div>
          </CardHeader>

          {showClosedTasks && (
            <CardContent className="p-4 sm:p-6 border-t border-gray-100 dark:border-gray-800 space-y-4">
              <p className="text-xs text-gray-500">
                These tasks have passed their deadline and are no longer accepting new submissions.
              </p>

              <div className="space-y-4">
                {closedTasks.map((task) => (
                  <TaskCardItem
                    key={task.id}
                    task={task}
                    isAdmin={isAdmin}
                    isMember={isMember}
                    expandedTaskId={expandedTaskId}
                    toggleSubmissions={toggleSubmissions}
                    handleStartEdit={handleStartEdit}
                    handlePromptDelete={handlePromptDelete}
                    getSubmissionForTask={getSubmissionForTask}
                    proofUrls={proofUrls}
                    setProofUrls={setProofUrls}
                    handleSubmitCompletion={handleSubmitCompletion}
                    submittingTaskId={submittingTaskId}
                    loadingSubmissionsFor={loadingSubmissionsFor}
                    submissionsByTask={submissionsByTask}
                    submissionsError={submissionsError}
                    handleVerify={handleVerify}
                    verifyingId={verifyingId}
                    isClosed
                  />
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* --------------------------------------------
          DELETE CONFIRMATION MODAL / BOTTOM SHEET
      --------------------------------------------- */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl space-y-5 animate-in slide-in-from-bottom-5">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 rounded-full bg-red-100 dark:bg-red-950/50">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-gray-900 dark:text-white">Delete Task Confirmation</h3>
                <p className="text-xs text-gray-500">Action cannot be undone for hard delete.</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Are you sure you want to remove <strong>{deleteTarget.action} on {deleteTarget.platform}</strong>?
              {deleteSubmissionsCount !== null && deleteSubmissionsCount > 0 && (
                <span className="block mt-2 font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800 text-xs">
                  This task currently has {deleteSubmissionsCount} member submission(s).
                </span>
              )}
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => handleConfirmDelete("soft")}
                className="w-full py-3 rounded-xl bg-amber-600 font-bold text-xs text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                Archive Task (Soft Delete - Recommended)
              </button>

              <button
                type="button"
                disabled={deleting}
                onClick={() => handleConfirmDelete("hard")}
                className="w-full py-3 rounded-xl bg-red-600 font-bold text-xs text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                Delete Permanently (Hard Delete)
              </button>

              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="w-full py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 font-bold text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------
// Sub-component: Task Card Item
// --------------------------------------------------

function TaskCardItem({
  task,
  isAdmin,
  isMember,
  expandedTaskId,
  toggleSubmissions,
  handleStartEdit,
  handlePromptDelete,
  getSubmissionForTask,
  proofUrls,
  setProofUrls,
  handleSubmitCompletion,
  submittingTaskId,
  loadingSubmissionsFor,
  submissionsByTask,
  submissionsError,
  handleVerify,
  verifyingId,
  isClosed = false,
}: {
  task: FirestoreTask;
  isAdmin: boolean;
  isMember: boolean;
  expandedTaskId: string | null;
  toggleSubmissions: (id: string) => void;
  handleStartEdit: (task: FirestoreTask) => void;
  handlePromptDelete: (task: FirestoreTask) => void;
  getSubmissionForTask: (id: string) => UserSubmission | undefined;
  proofUrls: Record<string, string>;
  setProofUrls: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleSubmitCompletion: (task: FirestoreTask) => void;
  submittingTaskId: string | null;
  loadingSubmissionsFor: string | null;
  submissionsByTask: Record<string, SubmissionWithUser[]>;
  submissionsError: string;
  handleVerify: (taskId: string, submissionId: string) => void;
  verifyingId: string | null;
  isClosed?: boolean;
}) {
  const existingSubmission = getSubmissionForTask(task.id);
  const isExpanded = expandedTaskId === task.id;
  const submissions = submissionsByTask[task.id] ?? [];
  const isLoadingSubmissions = loadingSubmissionsFor === task.id;
  const isSubmitting = submittingTaskId === task.id;
  const needsProof = requiresProof(task.action);
  const expired = isTaskExpired(task.deadline) || isClosed;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xs transition-all hover:border-gray-300 dark:hover:border-gray-700">
      <div className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-3 py-1 text-xs font-bold">
                {task.platform}
              </span>

              <span className="rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-1 text-xs font-bold">
                {task.action}
              </span>

              <span className="rounded-full bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 px-3 py-1 text-xs font-bold">
                +{task.points ?? 0} pts
              </span>

              {expired && (
                <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-3 py-1 text-xs font-bold inline-flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Closed
                </span>
              )}
            </div>

            <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
              {task.action} on {task.platform}
            </h3>

            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {task.deadline ? `Deadline: ${task.deadline}` : "No deadline (Never expires)"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {task.url && (
              <a
                href={task.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 px-3.5 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
              >
                Open Post
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => handleStartEdit(task)}
                  className="inline-flex items-center gap-1 rounded-xl border border-gray-300 dark:border-gray-700 px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Edit task"
                >
                  <Edit2 className="h-3.5 w-3.5" /> Edit
                </button>

                <button
                  type="button"
                  onClick={() => handlePromptDelete(task)}
                  className="inline-flex items-center gap-1 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors"
                  title="Delete task"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>

                <button
                  type="button"
                  onClick={() => toggleSubmissions(task.id)}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition-colors"
                >
                  Submissions
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Member Action Area */}
        {isMember && (
          <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4">
            {existingSubmission ? (
              <div
                className={
                  existingSubmission.status === "verified"
                    ? "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-4 border border-emerald-200 dark:border-emerald-800"
                    : "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 p-4 border border-amber-200 dark:border-amber-800"
                }
              >
                <div className="flex items-center gap-3">
                  {existingSubmission.status === "verified" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  ) : (
                    <Clock className="h-5 w-5 text-amber-600 shrink-0" />
                  )}

                  <div>
                    <p
                      className={
                        existingSubmission.status === "verified"
                          ? "font-extrabold text-xs text-emerald-900 dark:text-emerald-200"
                          : "font-extrabold text-xs text-amber-900 dark:text-amber-200"
                      }
                    >
                      {existingSubmission.status === "verified"
                        ? "Task Verified & Points Awarded!"
                        : "Submitted for Review"}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Submitted {formatDate(existingSubmission.submitted_at)}
                    </p>
                  </div>
                </div>

                {existingSubmission.proof_url && (
                  <a
                    href={existingSubmission.proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline"
                  >
                    View Submitted Proof
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ) : expired ? (
              <div className="p-4 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 font-medium flex items-center gap-2">
                <Lock className="h-4 w-4 text-gray-400 shrink-0" />
                This task closed on {task.deadline}. Submissions are no longer accepted.
              </div>
            ) : (
              <div className="space-y-3">
                {needsProof && (
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-gray-700 dark:text-gray-300">
                      {task.action === "Make Post" ? "Your Post URL *" : "Shared Post URL *"}
                    </label>

                    <input
                      type="url"
                      inputMode="url"
                      value={proofUrls[task.id] ?? ""}
                      onChange={(e) =>
                        setProofUrls((prev) => ({
                          ...prev,
                          [task.id]: e.target.value,
                        }))
                      }
                      placeholder={
                        task.action === "Make Post"
                          ? "https://facebook.com/your-post..."
                          : "https://facebook.com/your-shared-post..."
                      }
                      className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-base sm:text-sm font-medium focus:ring-2 focus:ring-emerald-500"
                    />

                    <p className="mt-1 text-[11px] text-gray-500">
                      {getActionHelpText(task.action)}
                    </p>
                  </div>
                )}

                {!needsProof && (
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    {getActionHelpText(task.action)}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => handleSubmitCompletion(task)}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {isSubmitting ? "Submitting..." : "Mark Completed"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Admin Submissions Drawer */}
      {isAdmin && isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-5 space-y-4">
          {submissionsError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {submissionsError}
            </div>
          )}

          {isLoadingSubmissions ? (
            <div className="flex items-center justify-center gap-2 py-6 text-gray-500 text-xs font-bold">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading member submissions…
            </div>
          ) : submissions.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-500">
              No members have submitted proof for this task yet.
            </div>
          ) : (
            <div className="space-y-3">
              <h4 className="font-extrabold text-xs text-gray-900 dark:text-white uppercase tracking-wider">
                Member Submissions ({submissions.length})
              </h4>

              <div className="space-y-2">
                {submissions.map((submission) => {
                  const socialName = getMemberSocialName(submission.user, task.platform);
                  const profileUrl = getMemberProfileUrl(submission.user, task.platform);
                  const isVerified = submission.status === "verified";
                  const isVerifying = verifyingId === submission.id;

                  return (
                    <div
                      key={submission.id}
                      className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs"
                    >
                      <div className="space-y-1">
                        <p className="font-bold text-sm text-gray-900 dark:text-white">
                          {submission.user?.full_name ?? "Unknown Member"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {task.platform} username: <span className="font-semibold text-gray-700 dark:text-gray-300">{socialName || "Not set"}</span>
                        </p>
                        {profileUrl && (
                          <a
                            href={profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline"
                          >
                            View Member Social Profile &rarr;
                          </a>
                        )}
                        <p className="text-[10px] text-gray-400">
                          Submitted {formatDate(submission.submitted_at)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {submission.proof_url && (
                          <a
                            href={submission.proof_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                          >
                            View Proof <ExternalLink className="h-3 w-3" />
                          </a>
                        )}

                        {isVerified ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-3 py-1.5 text-xs font-bold">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleVerify(task.id, submission.id)}
                            disabled={isVerifying}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            {isVerifying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {isVerifying ? "Verifying..." : "Verify & Award Points"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
