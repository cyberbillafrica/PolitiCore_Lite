"use client";

import { useEffect, useState, useMemo } from "react";
import {
  getAllInecOfficers,
  deleteInecOfficer,
  ENUGU_LGAS,
  InecOfficer,
} from "@/lib/firebase/inec-officers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Download,
  Printer,
  Search,
  Trash2,
  UserCheck,
  RefreshCw,
  UserPlus,
  Briefcase,
  Layers,
  Table as TableIcon,
} from "lucide-react";

export default function AdminInecOfficersPage() {
  const [officers, setOfficers] = useState<InecOfficer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedLga, setSelectedLga] = useState("");
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchOfficers = async () => {
    setLoading(true);
    try {
      const data = await getAllInecOfficers();
      setOfficers(data);
    } catch (err) {
      console.error("Failed to load INEC officers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOfficers();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the registration for ${name}?`)) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteInecOfficer(id);
      setOfficers((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      alert("Failed to delete registration. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  // Filter officers based on search query and selected LGA
  const filteredOfficers = useMemo(() => {
    return officers.filter((officer) => {
      const matchesSearch =
        officer.fullName.toLowerCase().includes(search.toLowerCase()) ||
        officer.phone.includes(search) ||
        officer.ward.toLowerCase().includes(search.toLowerCase()) ||
        officer.qualification.toLowerCase().includes(search.toLowerCase()) ||
        officer.submittedByName.toLowerCase().includes(search.toLowerCase()) ||
        officer.submittedByPosition.toLowerCase().includes(search.toLowerCase());

      const matchesLga = selectedLga ? officer.lga === selectedLga : true;

      return matchesSearch && matchesLga;
    });
  }, [officers, search, selectedLga]);

  // Group officers by who submitted them
  const groupedOfficers = useMemo(() => {
    const groups: { [key: string]: { name: string; position: string; officers: InecOfficer[] } } = {};

    filteredOfficers.forEach((officer) => {
      const key = `${officer.submittedByName}___${officer.submittedByPosition}`;
      if (!groups[key]) {
        groups[key] = {
          name: officer.submittedByName || "Direct Public Registration",
          position: officer.submittedByPosition || "N/A",
          officers: [],
        };
      }
      groups[key].officers.push(officer);
    });

    return Object.values(groups);
  }, [filteredOfficers]);

  // Export CSV Handler with Submitter columns
  const handleExportCSV = () => {
    if (filteredOfficers.length === 0) {
      alert("No data available to export.");
      return;
    }

    const headers = [
      "Officer Full Name",
      "Officer Phone",
      "LGA",
      "Ward",
      "Gender",
      "Qualification",
      "Submitted By Name",
      "Submitted By Position",
      "Registered Date",
    ];

    const rows = filteredOfficers.map((o) => {
      let dateStr = "N/A";
      if (o.createdAt) {
        if (o.createdAt.seconds) {
          dateStr = new Date(o.createdAt.seconds * 1000).toLocaleDateString();
        } else if (o.createdAt instanceof Date) {
          dateStr = o.createdAt.toLocaleDateString();
        } else if (typeof o.createdAt === "string") {
          dateStr = o.createdAt;
        }
      }

      return [
        `"${o.fullName.replace(/"/g, '""')}"`,
        `"${o.phone}"`,
        `"${o.lga}"`,
        `"${o.ward.replace(/"/g, '""')}"`,
        `"${o.gender}"`,
        `"${o.qualification.replace(/"/g, '""')}"`,
        `"${(o.submittedByName || "").replace(/"/g, '""')}"`,
        `"${(o.submittedByPosition || "").replace(/"/g, '""')}"`,
        `"${dateStr}"`,
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `DCM_Enugu_INEC_Officers_Grouped_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print PDF Handler
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Print-Only Header */}
      <div className="hidden print:block mb-8 text-center border-b-2 border-emerald-800 pb-4">
        <h1 className="text-2xl font-black text-gray-900">
          DCM ENUGU — DIRECTORATE OF CONTACT & MOBILIZATION
        </h1>
        <p className="text-sm font-bold text-emerald-800">
          INEC OFFICERS OFFICIAL ROSTER (GROUPED BY REGISTRAR)
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Generated on: {new Date().toLocaleDateString()} • Total Officers:{" "}
          {filteredOfficers.length} • Total Submitter Groups: {groupedOfficers.length}
        </p>
      </div>

      {/* Screen Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <UserCheck className="h-7 w-7 text-emerald-700" />
            Registered INEC Officers
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Grouped by who submitted each officer. Filter, print report, or export CSV.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchOfficers}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg shadow-sm transition-colors"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print / PDF Report
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print:hidden">
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 shrink-0">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Total Officers
            </span>
            <p className="text-2xl font-black text-gray-900">{filteredOfficers.length}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 shrink-0">
            <UserPlus className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Registrar / Submitters
            </span>
            <p className="text-2xl font-black text-gray-900">{groupedOfficers.length}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex items-center gap-4 sm:col-span-2 lg:col-span-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 shrink-0">
            <Briefcase className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Active LGA Filter
            </span>
            <p className="text-lg font-extrabold text-emerald-800">
              {selectedLga ? `${selectedLga} LGA` : "All 17 Enugu LGAs"}
            </p>
          </div>
        </div>
      </div>

      {/* Filters and Search Card */}
      <Card className="print:hidden">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            {/* Search Input */}
            <div className="relative md:col-span-1">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Officer, Submitter, Ward..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>

            {/* LGA Filter Dropdown */}
            <div>
              <select
                value={selectedLga}
                onChange={(e) => setSelectedLga(e.target.value)}
                className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 bg-white"
              >
                <option value="">All LGAs ({ENUGU_LGAS.length})</option>
                {ENUGU_LGAS.map((lga) => (
                  <option key={lga} value={lga}>
                    {lga} LGA
                  </option>
                ))}
              </select>
            </div>

            {/* Toggle View Mode */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setViewMode("grouped")}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border transition-all ${
                  viewMode === "grouped"
                    ? "bg-emerald-700 text-white border-emerald-700 shadow-sm"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                <Layers className="h-4 w-4" />
                Grouped View
              </button>
              <button
                onClick={() => setViewMode("flat")}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border transition-all ${
                  viewMode === "flat"
                    ? "bg-emerald-700 text-white border-emerald-700 shadow-sm"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                <TableIcon className="h-4 w-4" />
                Flat Table View
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Area */}
      {loading ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-gray-500">
            Loading registered INEC officers...
          </CardContent>
        </Card>
      ) : filteredOfficers.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-gray-500">
            No registered INEC officers match your search or filter.
          </CardContent>
        </Card>
      ) : viewMode === "grouped" ? (
        /* GROUPED VIEW BY SUBMITTER */
        <div className="space-y-6">
          {groupedOfficers.map((group, groupIdx) => (
            <Card key={groupIdx} className="overflow-hidden border-emerald-200">
              <CardHeader className="bg-emerald-50/80 border-b border-emerald-200 py-4 px-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-700 text-white font-extrabold text-sm shadow-sm">
                      {groupIdx + 1}
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-gray-900 leading-tight">
                        Submitted By: {group.name}
                      </h2>
                      <p className="text-xs font-semibold text-emerald-800 mt-0.5">
                        Designation / Position: {group.position}
                      </p>
                    </div>
                  </div>

                  <span className="px-3 py-1 rounded-full bg-emerald-200/80 text-emerald-900 text-xs font-extrabold self-start sm:self-auto">
                    {group.officers.length} Officer{group.officers.length > 1 ? "s" : ""} Registered
                  </span>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-600 font-bold border-b border-gray-200">
                      <tr>
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4">Officer Name</th>
                        <th className="py-3 px-4">Phone Number</th>
                        <th className="py-3 px-4">LGA</th>
                        <th className="py-3 px-4">Ward</th>
                        <th className="py-3 px-4">Gender</th>
                        <th className="py-3 px-4">Qualification</th>
                        <th className="py-3 px-4 print:hidden text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {group.officers.map((officer, oIdx) => (
                        <tr key={officer.id || oIdx} className="hover:bg-gray-50/80">
                          <td className="py-3 px-4 text-xs font-semibold text-gray-400">
                            {oIdx + 1}
                          </td>
                          <td className="py-3 px-4 font-bold text-gray-900">
                            {officer.fullName}
                          </td>
                          <td className="py-3 px-4 font-medium text-emerald-700">
                            {officer.phone}
                          </td>
                          <td className="py-3 px-4 font-semibold text-gray-800">
                            {officer.lga}
                          </td>
                          <td className="py-3 px-4 text-gray-600">{officer.ward}</td>
                          <td className="py-3 px-4 text-gray-600">{officer.gender}</td>
                          <td className="py-3 px-4 text-gray-800 font-bold">
                            {officer.qualification}
                          </td>
                          <td className="py-3 px-4 print:hidden text-right">
                            {officer.id && (
                              <button
                                onClick={() => handleDelete(officer.id!, officer.fullName)}
                                disabled={deletingId === officer.id}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete officer registration"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* FLAT TABLE VIEW */
        <Card>
          <CardHeader className="print:hidden pb-3">
            <CardTitle className="text-base font-bold text-gray-900">
              All Officers Flat Table ({filteredOfficers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-gray-50 text-xs uppercase text-gray-700 font-bold border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Officer Name</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">LGA</th>
                    <th className="py-3 px-4">Ward</th>
                    <th className="py-3 px-4">Gender</th>
                    <th className="py-3 px-4">Qualification</th>
                    <th className="py-3 px-4">Submitted By</th>
                    <th className="py-3 px-4 print:hidden text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredOfficers.map((officer, index) => (
                    <tr key={officer.id || index} className="hover:bg-gray-50/80">
                      <td className="py-3 px-4 text-xs font-semibold text-gray-400">
                        {index + 1}
                      </td>
                      <td className="py-3 px-4 font-bold text-gray-900">{officer.fullName}</td>
                      <td className="py-3 px-4 font-medium text-emerald-700">{officer.phone}</td>
                      <td className="py-3 px-4 font-semibold text-gray-800">{officer.lga}</td>
                      <td className="py-3 px-4 text-gray-600">{officer.ward}</td>
                      <td className="py-3 px-4 text-gray-600">{officer.gender}</td>
                      <td className="py-3 px-4 text-gray-800 font-bold">{officer.qualification}</td>
                      <td className="py-3 px-4 text-xs font-semibold text-emerald-900">
                        {officer.submittedByName}{" "}
                        <span className="text-gray-500 font-normal">
                          ({officer.submittedByPosition})
                        </span>
                      </td>
                      <td className="py-3 px-4 print:hidden text-right">
                        {officer.id && (
                          <button
                            onClick={() => handleDelete(officer.id!, officer.fullName)}
                            disabled={deletingId === officer.id}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete officer registration"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
