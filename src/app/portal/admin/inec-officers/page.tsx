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
  Table as TableIcon,
  Eye,
  X,
  CreditCard,
  MapPin,
  GraduationCap,
  Briefcase,
  FileText,
} from "lucide-react";

export default function AdminInecOfficersPage() {
  const [officers, setOfficers] = useState<InecOfficer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedLga, setSelectedLga] = useState("");
  const [selectedPosition, setSelectedPosition] = useState("");
  const [selectedOfficerModal, setSelectedOfficerModal] = useState<InecOfficer | null>(null);
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
      if (selectedOfficerModal?.id === id) {
        setSelectedOfficerModal(null);
      }
    } catch (err) {
      alert("Failed to delete registration. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  // Filter officers based on search query, LGA, and position
  const filteredOfficers = useMemo(() => {
    return officers.filter((officer) => {
      const searchTarget = [
        officer.fullName,
        officer.phone,
        officer.email,
        officer.nin,
        officer.ward,
        officer.qualification,
        officer.position,
        officer.bankName,
        officer.accountNumber,
        officer.accountName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchTarget.includes(search.toLowerCase());
      const matchesLga = selectedLga ? officer.lga === selectedLga : true;
      const matchesPosition = selectedPosition ? officer.position === selectedPosition : true;

      return matchesSearch && matchesLga && matchesPosition;
    });
  }, [officers, search, selectedLga, selectedPosition]);

  // Export CSV Handler with all new fields
  const handleExportCSV = () => {
    if (filteredOfficers.length === 0) {
      alert("No data available to export.");
      return;
    }

    const headers = [
      "Full Name",
      "Position Applied",
      "Email",
      "Phone",
      "NIN",
      "Gender",
      "Marital Status",
      "Address",
      "State",
      "LGA",
      "Ward",
      "Qualification",
      "Bank Name",
      "Account Number",
      "Account Name",
      "Submitted Date",
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
        `"${(o.fullName || "").replace(/"/g, '""')}"`,
        `"${o.position || ""}"`,
        `"${o.email || ""}"`,
        `"${o.phone || ""}"`,
        `"${o.nin || ""}"`,
        `"${o.gender || ""}"`,
        `"${o.maritalStatus || ""}"`,
        `"${(o.address || "").replace(/"/g, '""')}"`,
        `"${o.state || "Enugu State"}"`,
        `"${o.lga || ""}"`,
        `"${(o.ward || "").replace(/"/g, '""')}"`,
        `"${o.qualification || ""}"`,
        `"${(o.bankName || "").replace(/"/g, '""')}"`,
        `"${o.accountNumber || ""}"`,
        `"${(o.accountName || "").replace(/"/g, '""')}"`,
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
      `DCM_Enugu_INEC_Officers_${new Date().toISOString().slice(0, 10)}.csv`
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
          INEC AD-HOC OFFICERS APPLICANT ROSTER
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Generated on: {new Date().toLocaleDateString()} • Total Applicants:{" "}
          {filteredOfficers.length}
        </p>
      </div>

      {/* Screen Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <UserCheck className="h-7 w-7 text-emerald-700" />
            INEC Officers Applications
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage INEC Ad-hoc officer applications across all 17 LGAs of Enugu State.
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 shrink-0">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Total Applicants
            </span>
            <p className="text-2xl font-black text-gray-900">{filteredOfficers.length}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 shrink-0">
            <Briefcase className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Active Position Filter
            </span>
            <p className="text-lg font-bold text-gray-900">
              {selectedPosition || "All Positions (APO / PO / SPO)"}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 shrink-0">
            <MapPin className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Active LGA Filter
            </span>
            <p className="text-lg font-bold text-emerald-800">
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
            <div className="relative">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, phone, NIN, bank..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>

            {/* Position Filter Dropdown */}
            <div>
              <select
                value={selectedPosition}
                onChange={(e) => setSelectedPosition(e.target.value)}
                className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 bg-white"
              >
                <option value="">All Positions (APO, PO, SPO)</option>
                <option value="APO">APO - Assistant Presiding Officer</option>
                <option value="PO">PO - Presiding Officer</option>
                <option value="SPO">SPO - Supervisory Presiding Officer</option>
              </select>
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
          </div>
        </CardContent>
      </Card>

      {/* Main Table Content */}
      {loading ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-gray-500">
            Loading registered INEC officers...
          </CardContent>
        </Card>
      ) : filteredOfficers.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-gray-500">
            No applicant registrations match your search or filters.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="print:hidden pb-3">
            <CardTitle className="text-base font-bold text-gray-900 flex items-center justify-between">
              <span>Applications Roster ({filteredOfficers.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-gray-50 text-xs uppercase text-gray-700 font-bold border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Applicant Full Name</th>
                    <th className="py-3 px-4">Position</th>
                    <th className="py-3 px-4">Phone / Email</th>
                    <th className="py-3 px-4">NIN</th>
                    <th className="py-3 px-4">LGA / Ward</th>
                    <th className="py-3 px-4">Qualification</th>
                    <th className="py-3 px-4">Bank & Account</th>
                    <th className="py-3 px-4 print:hidden text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredOfficers.map((officer, index) => (
                    <tr key={officer.id || index} className="hover:bg-gray-50/80">
                      <td className="py-3 px-4 text-xs font-semibold text-gray-400">
                        {index + 1}
                      </td>
                      <td className="py-3 px-4 font-bold text-gray-900">
                        <div>{officer.fullName}</div>
                        <div className="text-xs font-normal text-gray-500">{officer.maritalStatus} • {officer.gender}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800">
                          {officer.position || "N/A"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-emerald-700">{officer.phone}</div>
                        <div className="text-xs text-gray-500">{officer.email}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-gray-700 font-bold">{officer.nin || "N/A"}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-gray-900">{officer.lga} LGA</div>
                        <div className="text-xs text-gray-500">{officer.ward}</div>
                      </td>
                      <td className="py-3 px-4 font-bold text-gray-800">{officer.qualification}</td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-bold text-gray-900">{officer.bankName}</div>
                        <div className="font-mono text-gray-600">{officer.accountNumber}</div>
                        <div className="text-[11px] text-gray-400">{officer.accountName}</div>
                      </td>
                      <td className="py-3 px-4 print:hidden text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedOfficerModal(officer)}
                            className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="View Full Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {officer.id && (
                            <button
                              onClick={() => handleDelete(officer.id!, officer.fullName)}
                              disabled={deletingId === officer.id}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete application"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DETAIL MODAL OVERLAY */}
      {selectedOfficerModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-gray-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-emerald-800 px-6 py-5 text-white flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-200">
                  INEC Officer Details
                </span>
                <h3 className="text-xl font-black mt-0.5">{selectedOfficerModal.fullName}</h3>
              </div>
              <button
                onClick={() => setSelectedOfficerModal(null)}
                className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-700 rounded-full transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 text-sm text-gray-700">
              {/* Personal Section */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-bold border-b border-gray-200 pb-2 mb-2">
                  <FileText className="h-4 w-4" /> Personal Information
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-400 block font-bold uppercase">First Name</span>
                    <span className="font-bold text-gray-900">{selectedOfficerModal.firstName || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-bold uppercase">Middle Name</span>
                    <span className="font-bold text-gray-900">{selectedOfficerModal.middleName || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-bold uppercase">Last Name</span>
                    <span className="font-bold text-gray-900">{selectedOfficerModal.lastName || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-bold uppercase">NIN Number</span>
                    <span className="font-mono font-bold text-gray-900">{selectedOfficerModal.nin}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-bold uppercase">Gender</span>
                    <span className="font-semibold text-gray-800">{selectedOfficerModal.gender}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-bold uppercase">Marital Status</span>
                    <span className="font-semibold text-gray-800">{selectedOfficerModal.maritalStatus}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-400 block font-bold uppercase">Address</span>
                    <span className="font-semibold text-gray-900">{selectedOfficerModal.address}</span>
                  </div>
                </div>
              </div>

              {/* Position & Location Section */}
              <div className="bg-emerald-50/70 rounded-2xl p-4 border border-emerald-200 space-y-2">
                <div className="flex items-center gap-2 text-emerald-900 font-bold border-b border-emerald-200 pb-2 mb-2">
                  <Briefcase className="h-4 w-4" /> Role & Location
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-emerald-800 block font-bold uppercase">Position Applied</span>
                    <span className="font-extrabold text-emerald-950 text-sm">{selectedOfficerModal.position}</span>
                  </div>
                  <div>
                    <span className="text-emerald-800 block font-bold uppercase">Qualification</span>
                    <span className="font-extrabold text-emerald-950 text-sm">{selectedOfficerModal.qualification}</span>
                  </div>
                  <div>
                    <span className="text-emerald-800 block font-bold uppercase">State</span>
                    <span className="font-bold text-gray-900">{selectedOfficerModal.state || "Enugu State"}</span>
                  </div>
                  <div>
                    <span className="text-emerald-800 block font-bold uppercase">LGA & Ward</span>
                    <span className="font-bold text-gray-900">{selectedOfficerModal.lga} LGA ({selectedOfficerModal.ward})</span>
                  </div>
                </div>
              </div>

              {/* Bank Details Section */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-bold border-b border-gray-200 pb-2 mb-2">
                  <CreditCard className="h-4 w-4" /> Bank Account Details
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-gray-400 block font-bold uppercase">Bank Name</span>
                    <span className="font-bold text-gray-900">{selectedOfficerModal.bankName}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-bold uppercase">Account Number</span>
                    <span className="font-mono font-bold text-emerald-800 text-sm">{selectedOfficerModal.accountNumber}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-bold uppercase">Account Name</span>
                    <span className="font-bold text-gray-900">{selectedOfficerModal.accountName}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-100 px-6 py-4 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">DCM Enugu Admin Verification Portal</span>
              <button
                onClick={() => setSelectedOfficerModal(null)}
                className="px-5 py-2 rounded-xl bg-gray-800 hover:bg-gray-900 text-white text-xs font-bold transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
