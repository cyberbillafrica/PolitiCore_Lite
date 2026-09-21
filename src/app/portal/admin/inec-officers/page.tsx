"use client";

import { useEffect, useState } from "react";
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
  Filter,
  RefreshCw,
  Building2,
} from "lucide-react";

export default function AdminInecOfficersPage() {
  const [officers, setOfficers] = useState<InecOfficer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedLga, setSelectedLga] = useState("");
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
  const filteredOfficers = officers.filter((officer) => {
    const matchesSearch =
      officer.fullName.toLowerCase().includes(search.toLowerCase()) ||
      officer.phone.includes(search) ||
      officer.ward.toLowerCase().includes(search.toLowerCase()) ||
      officer.qualification.toLowerCase().includes(search.toLowerCase());

    const matchesLga = selectedLga ? officer.lga === selectedLga : true;

    return matchesSearch && matchesLga;
  });

  // Export CSV Handler
  const handleExportCSV = () => {
    if (filteredOfficers.length === 0) {
      alert("No data available to export.");
      return;
    }

    const headers = ["Full Name", "Phone", "LGA", "Ward", "Gender", "Qualification", "Registered Date"];
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
        `"${dateStr}"`,
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `DCM_Enugu_INEC_Officers_${new Date().toISOString().slice(0, 10)}.csv`);
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
        <h1 className="text-2xl font-black text-gray-900">DCM ENUGU — DIRECTORATE OF CONTACT & MOBILIZATION</h1>
        <p className="text-sm font-bold text-emerald-800">REGISTERED INEC OFFICERS OFFICIAL ROSTER</p>
        <p className="text-xs text-gray-500 mt-1">Generated on: {new Date().toLocaleDateString()} • Total Officers: {filteredOfficers.length}</p>
      </div>

      {/* Screen Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <UserCheck className="h-7 w-7 text-emerald-700" />
            Registered INEC Officers
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage, filter, print, and export registered INEC officers across Enugu State.
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

      {/* Filters and Search Card */}
      <Card className="print:hidden">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Name, Phone, Ward, Qualification..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>

            {/* LGA Filter Dropdown */}
            <div className="relative">
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
          </div>
        </CardContent>
      </Card>

      {/* Table Card */}
      <Card>
        <CardHeader className="print:hidden pb-3">
          <CardTitle className="text-base font-bold text-gray-900 flex items-center justify-between">
            <span>Officers List ({loading ? "..." : filteredOfficers.length})</span>
            {selectedLga && (
              <span className="text-xs font-medium px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full">
                Filtered by {selectedLga} LGA
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">
              Loading registered INEC officers...
            </div>
          ) : filteredOfficers.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No registered INEC officers match your search or filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-gray-50 text-xs uppercase text-gray-700 font-bold border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Full Name</th>
                    <th className="py-3 px-4">Phone Number</th>
                    <th className="py-3 px-4">LGA</th>
                    <th className="py-3 px-4">Ward</th>
                    <th className="py-3 px-4">Gender</th>
                    <th className="py-3 px-4">Qualification</th>
                    <th className="py-3 px-4 print:hidden text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredOfficers.map((officer, index) => (
                    <tr key={officer.id || index} className="hover:bg-gray-50/80">
                      <td className="py-3 px-4 text-xs font-semibold text-gray-400">{index + 1}</td>
                      <td className="py-3 px-4 font-bold text-gray-900">{officer.fullName}</td>
                      <td className="py-3 px-4 font-medium text-emerald-700">{officer.phone}</td>
                      <td className="py-3 px-4 font-semibold text-gray-800">{officer.lga}</td>
                      <td className="py-3 px-4 text-gray-600">{officer.ward}</td>
                      <td className="py-3 px-4 text-gray-600">{officer.gender}</td>
                      <td className="py-3 px-4 text-gray-600 max-w-[200px] truncate" title={officer.qualification}>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
