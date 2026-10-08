"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { calculateEstimatedReach } from "@/lib/social-config";
import type { TaskAction, TaskPlatform } from "@/types";

import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { getAllTasks, getAllUsers } from "@/lib/firebase/firestore";

// Lazy-load charts with SSR disabled for optimal mobile loading performance
const AnalyticsCharts = dynamic(
  () => import("@/components/analytics/AnalyticsCharts"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-xs text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading interactive charts…
      </div>
    ),
  },
);

type PeriodPreset = "7d" | "30d" | "term" | "all" | "custom";

interface SubmissionDoc {
  id: string;
  task_id: string;
  user_id: string;
  status: "pending" | "verified";
  proof_url?: string | null;
  source?: "task" | "referral_bonus";
  submitted_at?: unknown;
  verified_at?: unknown;
  [key: string]: unknown;
}

interface UserDoc {
  id: string;
  full_name?: string;
  ward_id?: string;
  points?: number;
  [key: string]: unknown;
}

interface TaskDoc {
  id: string;
  platform?: TaskPlatform;
  action?: TaskAction;
  points?: number;
  url?: string;
  deadline?: string | null;
  status?: string;
  [key: string]: unknown;
}

export default function AdminAnalyticsPage() {
  const { profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.access_role === "admin";

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Period preset from URL parameter (defaults to 30d)
  const initialPeriod = (searchParams.get("period") as PeriodPreset) || "30d";
  const [period, setPeriod] = useState<PeriodPreset>(initialPeriod);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  const [loadingData, setLoadingData] = useState(true);
  const [rawTasks, setRawTasks] = useState<TaskDoc[]>([]);
  const [rawUsers, setRawUsers] = useState<UserDoc[]>([]);
  const [rawSubmissions, setRawSubmissions] = useState<SubmissionDoc[]>([]);
  const [showAllVolunteers, setShowAllVolunteers] = useState(false);

  // Sync URL parameter when period changes
  const handlePeriodChange = (newPeriod: PeriodPreset) => {
    setPeriod(newPeriod);
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", newPeriod);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const fetchData = async () => {
    setLoadingData(true);
    try {
      const [tasksRes, usersRes, subsSnap] = await Promise.all([
        getAllTasks(),
        getAllUsers(),
        getDocs(query(collection(db, "task_submissions"), orderBy("submitted_at", "desc"))),
      ]);

      const subsList = subsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as SubmissionDoc[];

      setRawTasks(tasksRes as TaskDoc[]);
      setRawUsers(usersRes as UserDoc[]);
      setRawSubmissions(subsList);
    } catch (err) {
      console.error("Failed to load analytics data:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!authLoading && isAdmin) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      fetchData();
    }
  }, [authLoading, isAdmin]);

  // Determine cutoff date for period filtering
  const periodCutoff = useMemo(() => {
    const now = new Date();
    if (period === "7d") {
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    if (period === "30d") {
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    if (period === "term") {
      return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    }
    if (period === "custom" && customStartDate) {
      return new Date(customStartDate);
    }
    return null; // "all"
  }, [period, customStartDate]);

  // Filter submissions based on period
  const filteredSubmissions = useMemo(() => {
    return rawSubmissions.filter((sub) => {
      if (!periodCutoff) return true;
      const subTime =
        sub.submitted_at &&
        typeof sub.submitted_at === "object" &&
        "toDate" in sub.submitted_at &&
        typeof (sub.submitted_at as { toDate?: unknown }).toDate === "function"
          ? (sub.submitted_at as { toDate: () => Date }).toDate()
          : sub.submitted_at
            ? new Date(sub.submitted_at as string | number)
            : null;

      if (!subTime) return true;

      if (period === "custom" && customEndDate) {
        const end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
        return subTime >= periodCutoff && subTime <= end;
      }

      return subTime >= periodCutoff;
    });
  }, [rawSubmissions, periodCutoff, period, customEndDate]);

  // User map for fast lookup
  const userMap = useMemo(() => {
    const map = new Map<string, UserDoc>();
    for (const u of rawUsers) {
      map.set(u.id, u);
    }
    return map;
  }, [rawUsers]);

  // Task map for fast lookup
  const taskMap = useMemo(() => {
    const map = new Map<string, TaskDoc>();
    for (const t of rawTasks) {
      map.set(t.id, t);
    }
    return map;
  }, [rawTasks]);

  // Computed Metrics
  const verifiedSubmissions = useMemo(
    () => filteredSubmissions.filter((s) => s.status === "verified"),
    [filteredSubmissions],
  );

  const pendingSubmissions = useMemo(
    () => filteredSubmissions.filter((s) => s.status === "pending"),
    [filteredSubmissions],
  );

  // Total points awarded in period
  const totalPointsAwarded = useMemo(() => {
    let sum = 0;
    for (const sub of verifiedSubmissions) {
      if (sub.source === "referral_bonus") {
        sum += 100;
      } else {
        const task = taskMap.get(sub.task_id);
        sum += Number(task?.points ?? 0);
      }
    }
    return sum;
  }, [verifiedSubmissions, taskMap]);

  // Total estimated reach generated in period
  const totalEstimatedReach = useMemo(() => {
    let reach = 0;
    for (const sub of verifiedSubmissions) {
      if (sub.source !== "referral_bonus") {
        const task = taskMap.get(sub.task_id);
        reach += calculateEstimatedReach(task?.action || "Like", 1);
      }
    }
    return reach;
  }, [verifiedSubmissions, taskMap]);

  // Volunteer Rankings in period
  const volunteerRankings = useMemo(() => {
    const userScores = new Map<
      string,
      { userId: string; name: string; ward: string; points: number; verifiedTasks: number }
    >();

    for (const sub of verifiedSubmissions) {
      const u = userMap.get(sub.user_id);
      const task = taskMap.get(sub.task_id);
      const points = sub.source === "referral_bonus" ? 100 : Number(task?.points ?? 0);

      const referredName = typeof sub.referred_user_name === "string" ? sub.referred_user_name : undefined;
      const existing = userScores.get(sub.user_id) || {
        userId: sub.user_id,
        name: u?.full_name || referredName || "Volunteer",
        ward: u?.ward_id || "N/A",
        points: 0,
        verifiedTasks: 0,
      };

      existing.points += points;
      existing.verifiedTasks += 1;
      userScores.set(sub.user_id, existing);
    }

    return Array.from(userScores.values()).sort((a, b) => b.points - a.points);
  }, [verifiedSubmissions, userMap, taskMap]);

  // Task Performance Breakdown
  const taskMetrics = useMemo(() => {
    const metrics = rawTasks.map((task) => {
      const subsForTask = filteredSubmissions.filter((s) => s.task_id === task.id);
      const verifiedCount = subsForTask.filter((s) => s.status === "verified").length;
      const pendingCount = subsForTask.filter((s) => s.status === "pending").length;
      const totalCount = subsForTask.length;
      const completionRate = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0;
      const estimatedReach = calculateEstimatedReach(task.action || "Like", verifiedCount);

      return {
        id: task.id,
        platform: task.platform || "Facebook",
        action: task.action || "Like",
        points: task.points || 0,
        pendingCount,
        verifiedCount,
        totalCount,
        completionRate,
        estimatedReach,
      };
    });

    return metrics.sort((a, b) => b.verifiedCount - a.verifiedCount);
  }, [rawTasks, filteredSubmissions]);

  // Daily Trends for Recharts
  const dailyTrends = useMemo(() => {
    const dayMap = new Map<string, { date: string; points: number; verifiedCount: number }>();

    for (const sub of verifiedSubmissions) {
      const subTime =
        sub.verified_at &&
        typeof sub.verified_at === "object" &&
        "toDate" in sub.verified_at &&
        typeof (sub.verified_at as { toDate?: unknown }).toDate === "function"
          ? (sub.verified_at as { toDate: () => Date }).toDate()
          : new Date();

      const dateStr = subTime.toLocaleDateString("en-NG", { month: "short", day: "numeric" });
      const task = taskMap.get(sub.task_id);
      const points = sub.source === "referral_bonus" ? 100 : Number(task?.points ?? 0);

      const existing = dayMap.get(dateStr) || { date: dateStr, points: 0, verifiedCount: 0 };
      existing.points += points;
      existing.verifiedCount += 1;
      dayMap.set(dateStr, existing);
    }

    return Array.from(dayMap.values()).slice(-14);
  }, [verifiedSubmissions, taskMap]);

  // CSV Export Handlers
  const exportVolunteersCSV = () => {
    const headers = ["Rank,Name,Ward,Verified Tasks,Total Points Earned\n"];
    const rows = volunteerRankings.map(
      (v, idx) => `${idx + 1},"${v.name}","${v.ward}",${v.verifiedTasks},${v.points}`,
    );
    const csvContent = "data:text/csv;charset=utf-8," + headers.concat(rows.join("\n")).join("");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `politicore_volunteers_${period}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportTasksCSV = () => {
    const headers = [
      "Task ID,Platform,Action,Points,Pending Submissions,Verified Submissions,Completion Rate (%),Estimated Reach\n",
    ];
    const rows = taskMetrics.map(
      (t) =>
        `"${t.id}","${t.platform}","${t.action}",${t.points},${t.pendingCount},${t.verifiedCount},${t.completionRate}%,${t.estimatedReach}`,
    );
    const csvContent = "data:text/csv;charset=utf-8," + headers.concat(rows.join("\n")).join("");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `politicore_tasks_performance_${period}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading analytics…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Access Denied. Social Analytics is restricted to Administrators.
      </div>
    );
  }

  const displayedVolunteers = showAllVolunteers
    ? volunteerRankings
    : volunteerRankings.slice(0, 10);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-20">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold mb-1">
            <BarChart3 className="h-3.5 w-3.5" /> Social Force Analytics
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">
            Advanced Analytics Dashboard
          </h1>
          <p className="text-xs text-gray-500">
            Real-time performance metrics, volunteer rankings, completion rates, and reach estimates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            disabled={loadingData}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Period Selector Bar */}
      <Card className="border-gray-200 dark:border-gray-800 shadow-xs">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <Calendar className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300 mr-2 shrink-0">
              Period:
            </span>
            {[
              { id: "7d", label: "7 Days" },
              { id: "30d", label: "30 Days" },
              { id: "term", label: "This Term" },
              { id: "all", label: "All Time" },
              { id: "custom", label: "Custom Range" },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePeriodChange(preset.id as PeriodPreset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  period === preset.id
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {period === "custom" && (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="rounded-lg border px-2 py-1 bg-white dark:bg-gray-800 text-xs"
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="rounded-lg border px-2 py-1 bg-white dark:bg-gray-800 text-xs"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top 4 Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border-gray-200 dark:border-gray-800 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-emerald-700">
              <Award className="h-5 w-5" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">
                Points
              </span>
            </div>
            <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {totalPointsAwarded.toLocaleString()}
            </p>
            <p className="text-[11px] text-gray-500">Total Points Awarded</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-teal-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full">
                Verified
              </span>
            </div>
            <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {verifiedSubmissions.length}
            </p>
            <p className="text-[11px] text-gray-500">Verified Submissions</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-amber-700">
              <Clock className="h-5 w-5" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                Pending
              </span>
            </div>
            <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              {pendingSubmissions.length}
            </p>
            <p className="text-[11px] text-gray-500">Pending Admin Review</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-emerald-700">
              <Eye className="h-5 w-5" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">
                Estimate
              </span>
            </div>
            <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">
              ~{totalEstimatedReach.toLocaleString()}
            </p>
            <p className="text-[11px] text-gray-500">Est. Digital Reach</p>
          </CardContent>
        </Card>
      </div>

      {/* Trend Charts Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" /> Engagement Trends
          </h2>
        </div>
        <AnalyticsCharts data={dailyTrends} />
      </div>

      {/* Top Active Volunteers Section */}
      <Card className="border-gray-200 dark:border-gray-800 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
          <div>
            <CardTitle className="text-base font-extrabold flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" /> Most Active Volunteers
            </CardTitle>
            <p className="text-xs text-gray-500">
              Ranked list of top members by verified points awarded in period.
            </p>
          </div>

          <button
            type="button"
            onClick={exportVolunteersCSV}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {displayedVolunteers.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-500">
              No verified volunteer activity recorded in this period.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-gray-500 font-bold uppercase tracking-wider">
                      <th className="pb-2">Rank</th>
                      <th className="pb-2">Member Name</th>
                      <th className="pb-2">Ward</th>
                      <th className="pb-2 text-center">Verified Tasks</th>
                      <th className="pb-2 text-right">Points Earned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {displayedVolunteers.map((vol, idx) => (
                      <tr key={vol.userId} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                        <td className="py-3 font-extrabold text-emerald-700">#{idx + 1}</td>
                        <td className="py-3 font-bold text-gray-900 dark:text-white">{vol.name}</td>
                        <td className="py-3 text-gray-500">{vol.ward}</td>
                        <td className="py-3 text-center font-semibold">{vol.verifiedTasks}</td>
                        <td className="py-3 text-right font-black text-emerald-600">
                          +{vol.points} pts
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-2">
                {displayedVolunteers.map((vol, idx) => (
                  <div
                    key={vol.userId}
                    className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs">
                        #{idx + 1}
                      </span>
                      <div>
                        <p className="font-bold text-xs text-gray-900 dark:text-white">{vol.name}</p>
                        <p className="text-[10px] text-gray-500">Ward: {vol.ward}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-xs text-emerald-600">+{vol.points} pts</p>
                      <p className="text-[10px] text-gray-400">{vol.verifiedTasks} tasks</p>
                    </div>
                  </div>
                ))}
              </div>

              {volunteerRankings.length > 10 && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAllVolunteers((prev) => !prev)}
                    className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    {showAllVolunteers
                      ? "Show Top 10 Only"
                      : `Show All ${volunteerRankings.length} Volunteers`}
                  </button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Task Performance Table */}
      <Card className="border-gray-200 dark:border-gray-800 shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
          <div>
            <CardTitle className="text-base font-extrabold">Task Completion & Reach Breakdown</CardTitle>
            <p className="text-xs text-gray-500">
              Per-task completion rates and estimated digital reach multipliers.
            </p>
          </div>

          <button
            type="button"
            onClick={exportTasksCSV}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {taskMetrics.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-500">
              No tasks found in system.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-gray-500 font-bold uppercase tracking-wider">
                      <th className="pb-2">Platform / Action</th>
                      <th className="pb-2 text-center">Points</th>
                      <th className="pb-2 text-center">Pending</th>
                      <th className="pb-2 text-center">Verified</th>
                      <th className="pb-2 text-center">Completion Rate</th>
                      <th className="pb-2 text-right">Est. Reach</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {taskMetrics.map((task) => (
                      <tr key={task.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                        <td className="py-3">
                          <span className="font-extrabold text-gray-900 dark:text-white">
                            {task.action}
                          </span>
                          <span className="ml-2 text-gray-400">({task.platform})</span>
                        </td>
                        <td className="py-3 text-center font-bold text-emerald-600">
                          +{task.points}
                        </td>
                        <td className="py-3 text-center font-semibold text-amber-600">
                          {task.pendingCount}
                        </td>
                        <td className="py-3 text-center font-bold text-teal-600">
                          {task.verifiedCount}
                        </td>
                        <td className="py-3 text-center">
                          <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950 font-extrabold text-emerald-800 dark:text-emerald-200">
                            {task.completionRate}%
                          </span>
                        </td>
                        <td className="py-3 text-right font-black text-gray-800 dark:text-gray-200">
                          ~{task.estimatedReach.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-2">
                {taskMetrics.map((task) => (
                  <div
                    key={task.id}
                    className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-extrabold text-xs text-gray-900 dark:text-white">
                        {task.action} on {task.platform}
                      </p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        +{task.points} pts
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-[11px] pt-1 border-t border-gray-100 dark:border-gray-800">
                      <div>
                        <p className="text-gray-400 text-[9px] uppercase">Verified</p>
                        <p className="font-bold text-emerald-600">{task.verifiedCount}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-[9px] uppercase">Completion</p>
                        <p className="font-bold text-gray-800 dark:text-gray-200">{task.completionRate}%</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-[9px] uppercase">Est. Reach</p>
                        <p className="font-bold text-teal-600">~{task.estimatedReach}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
