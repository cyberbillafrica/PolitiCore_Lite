"use client";

import { useState } from "react";
import { Users, Plus, UserPlus, Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { FEATURE_TEAMS } from "@/lib/social-config";
import { createTeam, joinTeamByCode } from "@/lib/firebase/firestore";

export default function TeamsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [teamName, setTeamName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading teams…
      </div>
    );
  }

  if (!FEATURE_TEAMS) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 space-y-6 text-center">
        <div className="p-4 rounded-full bg-amber-100 text-amber-800 w-16 h-16 mx-auto flex items-center justify-center">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Sub-Teams Feature Flagged</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          Relational Sub-teams (Phase 2) is currently disabled behind the <code>FEATURE_TEAMS</code> flag.
          This feature will allow members to organize into localized digital sub-teams and compete on team leaderboards.
        </p>
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id || !teamName.trim()) return;
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await createTeam(teamName, profile.id);
      setSuccess("Sub-team created successfully!");
      setTeamName("");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to create team.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id || !joinCode.trim()) return;
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await joinTeamByCode(joinCode, profile.id);
      setSuccess("Successfully joined sub-team!");
      setJoinCode("");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to join team.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="h-6 w-6 text-emerald-600" /> Relational Sub-Teams
        </h1>
        <p className="text-xs text-gray-500">
          Form local digital teams, share invite codes, and compete on the team leaderboard.
        </p>
      </div>

      {error && <div className="p-4 rounded-xl bg-red-50 text-red-700 text-xs">{error}</div>}
      {success && <div className="p-4 rounded-xl bg-emerald-50 text-emerald-800 text-xs">{success}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Plus className="h-4 w-4 text-emerald-600" /> Create a Sub-Team
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <input
                type="text"
                required
                placeholder="Team Name (e.g. Ward 4 Digital Force)"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full p-3 rounded-xl border text-sm"
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-emerald-700 text-white font-bold text-xs rounded-xl hover:bg-emerald-800"
              >
                Create Team
              </button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-emerald-600" /> Join Existing Team
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoin} className="space-y-4">
              <input
                type="text"
                required
                placeholder="6-Character Join Code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="w-full p-3 rounded-xl border text-sm uppercase"
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-emerald-700 text-white font-bold text-xs rounded-xl hover:bg-emerald-800"
              >
                Join Team
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
