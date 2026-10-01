"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { getErrorMessage } from "@/lib/errors";
import {
  getAllElectionResults,
  getElectionResultsByLga,
  getElectionResultsByPollingUnit,
  getElectionResultsByWard,
} from "@/lib/firebase/firestore";
import { getWardById } from "@/lib/constants";

import type { ElectionResultRecord } from "@/types";

function getCoordinatorRank(position: string) {
  switch (position) {
    case "ward_coordinator":
      return 1;
    case "lga_coordinator":
      return 2;
    case "zone_coordinator":
      return 3;
    case "state_coordinator":
      return 4;
    default:
      return 0;
  }
}

function totalVotes(result: ElectionResultRecord) {
  return (result.results ?? []).reduce(
    (sum, row) => sum + Number(row?.votes ?? 0),
    0,
  );
}

function formatDate(value: unknown) {
  if (!value) return "—";

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  if (typeof value === "number") {
    return new Date(value).toLocaleDateString();
  }

  if (typeof value === "object" && "toDate" in value) {
    const maybeDate = value as { toDate?: () => Date };
    if (typeof maybeDate.toDate === "function") {
      return maybeDate.toDate().toLocaleDateString();
    }
  }

  return String(value);
}

export default function ElectionResultsPage() {
  const router = useRouter();
  const { profile, assignments, accessLoading } = useAuth();

  const [results, setResults] = useState<ElectionResultRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedWard, setSelectedWard] = useState("all");
  const [selectedPu, setSelectedPu] = useState("all");

  const role = profile?.access_role ?? null;
  const isCampaignMember =
    profile?.membership_types?.includes("campaign_member") ?? false;

  const coordinatorAssignments = assignments.filter((assignment) =>
    [
      "ward_coordinator",
      "lga_coordinator",
      "zone_coordinator",
      "state_coordinator",
    ].includes(assignment.position),
  );

  const selectedCoordinator = [...coordinatorAssignments].sort(
    (a, b) => getCoordinatorRank(b.position) - getCoordinatorRank(a.position),
  )[0];

  const canViewResults =
    role === "admin" ||
    role === "election_officer" ||
    isCampaignMember ||
    Boolean(selectedCoordinator);

  useEffect(() => {
    if (accessLoading) return;

    if (!profile) {
      router.replace("/login");
      return;
    }

    if (!canViewResults) {
      router.replace("/portal/dashboard");
      return;
    }
  }, [accessLoading, profile, canViewResults, router]);

  useEffect(() => {
    if (accessLoading || !profile || !canViewResults) {
      return;
    }

    let mounted = true;

    const loadResults = async () => {
      setLoading(true);
      setError("");

      try {
        let nextResults: ElectionResultRecord[] = [];

        if (role === "admin" || role === "election_officer") {
          nextResults = await getAllElectionResults();
        } else if (isCampaignMember && profile.polling_unit_id) {
          nextResults = await getElectionResultsByPollingUnit(
            profile.polling_unit_id,
          );
        } else if (selectedCoordinator) {
          const scopeId = selectedCoordinator.scope_id;
          const scopeType = selectedCoordinator.scope_type;

          if (selectedCoordinator.position === "ward_coordinator") {
            nextResults = await getElectionResultsByWard(scopeId);
          } else if (selectedCoordinator.position === "lga_coordinator") {
            nextResults = await getElectionResultsByLga(scopeId);
          } else {
            const allResults = await getAllElectionResults();
            nextResults = allResults.filter((result) => {
              const wardId = result.ward_id?.toLowerCase() ?? "";
              const lgaId = (
                result.lga_id ?? wardId.replace(/-ward-[^-]+$/, "")
              ).toLowerCase();
              const candidateScope = scopeId.toLowerCase();

              if (scopeType === "senatorial_zone" || scopeType === "state") {
                return (
                  wardId.includes(candidateScope) ||
                  lgaId.includes(candidateScope) ||
                  candidateScope.includes(wardId) ||
                  candidateScope.includes(lgaId)
                );
              }

              return false;
            });
          }
        }

        if (mounted) {
          setResults(nextResults);
        }
      } catch (err) {
        if (mounted) {
          setError(
            getErrorMessage(err, "Unable to load election results right now."),
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadResults();

    return () => {
      mounted = false;
    };
  }, [
    accessLoading,
    canViewResults,
    isCampaignMember,
    profile,
    role,
    selectedCoordinator,
  ]);

  const wardOptions = useMemo(
    () => Array.from(new Set(results.map((result) => result.ward_id))),
    [results],
  );

  const pollingUnitOptions = useMemo(
    () =>
      Array.from(
        new Set(
          results
            .filter(
              (result) =>
                selectedWard === "all" || result.ward_id === selectedWard,
            )
            .map((result) => result.polling_unit_id),
        ),
      ),
    [results, selectedWard],
  );

  const visibleResults = results.filter((result) => {
    if (selectedWard !== "all" && result.ward_id !== selectedWard) {
      return false;
    }

    if (selectedPu !== "all" && result.polling_unit_id !== selectedPu) {
      return false;
    }

    return true;
  });

  const isAdminOrElectionOfficer =
    role === "admin" || role === "election_officer";

  if (accessLoading || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading election results…</span>
        </div>
      </div>
    );
  }

  if (!canViewResults) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <ShieldAlert className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            Election access restricted
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            You do not have permission to view election results.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Election Results</h1>
          <p className="mt-1 text-gray-600">
            Read-only view of submitted results for your assigned scope.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isAdminOrElectionOfficer && (
        <div className="grid gap-4 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Ward
            </label>
            <select
              value={selectedWard}
              onChange={(event) => {
                setSelectedWard(event.target.value);
                setSelectedPu("all");
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-apc-primary focus:outline-none focus:ring-2 focus:ring-apc-primary/20"
            >
              <option value="all">All wards</option>
              {wardOptions.map((wardId) => (
                <option key={wardId} value={wardId}>
                  {getWardById(wardId)?.name ?? wardId}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Polling Unit
            </label>
            <select
              value={selectedPu}
              onChange={(event) => setSelectedPu(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-apc-primary focus:outline-none focus:ring-2 focus:ring-apc-primary/20"
            >
              <option value="all">All polling units</option>
              {pollingUnitOptions.map((pollingUnitId) => (
                <option key={pollingUnitId} value={pollingUnitId}>
                  {pollingUnitId}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="min-w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Ward
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Polling Unit
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                APC
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                PDP
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                NDC
              </th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                Total
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Verified
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Submitted by
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleResults.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-12 text-center text-sm text-gray-500"
                >
                  No election results match the current scope.
                </td>
              </tr>
            ) : (
              visibleResults.map((result) => {
                const partyTotals = {
                  APC:
                    result.results.find((row) => row.party === "APC")?.votes ??
                    0,
                  PDP:
                    result.results.find((row) => row.party === "PDP")?.votes ??
                    0,
                  NDC:
                    result.results.find((row) => row.party === "NDC")?.votes ??
                    0,
                };

                return (
                  <tr
                    key={
                      result.id ?? `${result.ward_id}-${result.polling_unit_id}`
                    }
                    className="border-b hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {getWardById(result.ward_id)?.name ?? result.ward_id}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {result.polling_unit_id}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">
                      {partyTotals.APC.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">
                      {partyTotals.PDP.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">
                      {partyTotals.NDC.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                      {totalVotes(result).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {result.verified ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          <CheckCircle2 className="h-3 w-3" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {result.submitted_by}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {formatDate(result.created_at)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
