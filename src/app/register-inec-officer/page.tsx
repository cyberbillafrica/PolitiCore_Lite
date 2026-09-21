"use client";

import { useState } from "react";
import Link from "next/link";
import {
  UserCheck,
  Phone,
  User,
  MapPin,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Building2,
} from "lucide-react";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import {
  registerInecOfficer,
  ENUGU_LGAS,
  InecOfficer,
} from "@/lib/firebase/inec-officers";

export default function RegisterInecOfficerPage() {
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    lga: "",
    ward: "",
    gender: "",
    qualification: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedOfficer, setSubmittedOfficer] = useState<InecOfficer | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (
      !formData.fullName.trim() ||
      !formData.phone.trim() ||
      !formData.lga ||
      !formData.ward.trim() ||
      !formData.gender ||
      !formData.qualification
    ) {
      setError("Please fill out all required fields before submitting.");
      return;
    }

    try {
      setLoading(true);
      await registerInecOfficer(formData);
      setSubmittedOfficer({ ...formData });
      setFormData({
        fullName: "",
        phone: "",
        lga: "",
        ward: "",
        gender: "",
        qualification: "",
      });
    } catch (err: any) {
      console.error("Failed to submit INEC officer registration:", err);
      setError("Failed to submit your registration. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Breadcrumb / Back Link */}
        <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/" className="inline-flex items-center gap-1 hover:text-emerald-700">
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
          <span>/</span>
          <span className="text-gray-800 font-medium">INEC Officers Registration</span>
        </div>

        {/* Page Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
            <UserCheck className="h-4 w-4" />
            INEC Officers Recruitment Portal
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
            Register as an INEC Officer
          </h1>
          <p className="mt-2 text-base text-gray-600 max-w-xl mx-auto">
            Directate of Contact and Mobilization (DCM Enugu) registration portal for INEC Officers across all 17 Local Government Areas of Enugu State.
          </p>
        </div>

        {/* Success Confirmation Card */}
        {submittedOfficer ? (
          <div className="bg-white rounded-3xl border border-emerald-200 shadow-xl p-8 text-center animate-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mb-4">
              <CheckCircle2 className="h-10 w-10" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900">Registration Successful!</h2>
            <p className="text-sm text-gray-600 mt-2 max-w-lg mx-auto">
              Thank you, <span className="font-bold text-gray-900">{submittedOfficer.fullName}</span>. Your details have been successfully received and submitted to the DCM Enugu Secretariat database.
            </p>

            <div className="mt-6 bg-emerald-50/70 rounded-2xl p-6 text-left border border-emerald-100 space-y-3 max-w-md mx-auto text-sm text-gray-700">
              <div className="flex justify-between border-b border-emerald-200/60 pb-2">
                <span className="text-xs font-bold uppercase text-emerald-800">Full Name</span>
                <span className="font-bold text-gray-900">{submittedOfficer.fullName}</span>
              </div>
              <div className="flex justify-between border-b border-emerald-200/60 pb-2">
                <span className="text-xs font-bold uppercase text-emerald-800">Phone Contact</span>
                <span className="font-semibold text-gray-900">{submittedOfficer.phone}</span>
              </div>
              <div className="flex justify-between border-b border-emerald-200/60 pb-2">
                <span className="text-xs font-bold uppercase text-emerald-800">LGA / Ward</span>
                <span className="font-semibold text-gray-900">{submittedOfficer.lga} LGA ({submittedOfficer.ward})</span>
              </div>
              <div className="flex justify-between border-b border-emerald-200/60 pb-2">
                <span className="text-xs font-bold uppercase text-emerald-800">Gender</span>
                <span className="font-semibold text-gray-900">{submittedOfficer.gender}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-bold uppercase text-emerald-800">Qualification</span>
                <span className="font-semibold text-gray-900">{submittedOfficer.qualification}</span>
              </div>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => setSubmittedOfficer(null)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm shadow-md transition-colors"
              >
                Register Another Officer
              </button>
              <Link
                href="/"
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-sm transition-colors"
              >
                Return to Homepage
              </Link>
            </div>
          </div>
        ) : (
          /* Form Container */
          <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden p-6 sm:p-10">
            {error && (
              <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-800 text-sm">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <User className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chief Chidozie Okafor"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm transition-all"
                  />
                </div>
              </div>

              {/* Phone & Gender Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Phone Number */}
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                      <Phone className="h-5 w-5" />
                    </div>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 08012345678"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm transition-all"
                    />
                  </div>
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                    Gender <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm transition-all bg-white"
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
              </div>

              {/* LGA & Ward Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* LGA Dropdown */}
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                    Enugu State LGA <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={formData.lga}
                      onChange={(e) => setFormData({ ...formData, lga: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm transition-all bg-white"
                    >
                      <option value="">Select Local Government Area</option>
                      {ENUGU_LGAS.map((lga) => (
                        <option key={lga} value={lga}>
                          {lga} LGA
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Ward */}
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                    Ward <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ward 02 / Amechi"
                      value={formData.ward}
                      onChange={(e) => setFormData({ ...formData, ward: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Qualification */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                  Qualification <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <select
                    required
                    value={formData.qualification}
                    onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm transition-all bg-white"
                  >
                    <option value="">Select Highest Qualification</option>
                    <option value="SSCE / WASSCE / O'Level">SSCE / WASSCE / O'Level</option>
                    <option value="NCE / OND">NCE / OND</option>
                    <option value="HND / B.Sc / B.Ed / B.Tech">HND / B.Sc / B.Ed / B.Tech (Bachelor's Degree)</option>
                    <option value="Master's Degree (M.Sc / M.Ed / MBA)">Master's Degree (M.Sc / M.Ed / MBA)</option>
                    <option value="Doctorate / PhD">Doctorate / PhD</option>
                    <option value="Others / Technical Diploma">Others / Technical Diploma</option>
                  </select>
                </div>
              </div>

              {/* Submit CTA */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-extrabold text-base shadow-lg transition-all"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Submitting Registration...
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-5 w-5" />
                      Submit INEC Officer Registration
                    </>
                  )}
                </button>
                <p className="text-center text-xs text-gray-400 mt-3">
                  Open to all eligible citizens. Submitted data is officially stored in the DCM Enugu database.
                </p>
              </div>
            </form>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
