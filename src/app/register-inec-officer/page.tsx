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
  Mail,
  CreditCard,
  Building,
  Heart,
  Briefcase,
  FileText,
} from "lucide-react";

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import {
  registerInecOfficer,
  ENUGU_LGAS,
  QUALIFICATIONS,
  POSITIONS,
  MARITAL_STATUSES,
  InecOfficer,
} from "@/lib/firebase/inec-officers";

export default function RegisterInecOfficerPage() {
  const [formData, setFormData] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    nin: "",
    state: "Enugu State",
    lga: "",
    ward: "",
    gender: "",
    qualification: "Degree",
    position: "APO",
    bankName: "",
    accountNumber: "",
    accountName: "",
    maritalStatus: "Single",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedOfficer, setSubmittedOfficer] = useState<InecOfficer | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (
      !formData.firstName.trim() ||
      !formData.lastName.trim() ||
      !formData.email.trim() ||
      !formData.phone.trim() ||
      !formData.address.trim() ||
      !formData.nin.trim() ||
      !formData.lga ||
      !formData.ward.trim() ||
      !formData.gender ||
      !formData.qualification ||
      !formData.position ||
      !formData.bankName.trim() ||
      !formData.accountNumber.trim() ||
      !formData.accountName.trim() ||
      !formData.maritalStatus
    ) {
      setError("Please fill out all compulsory fields marked with an asterisk (*).");
      return;
    }

    const fullName = [formData.firstName.trim(), formData.middleName.trim(), formData.lastName.trim()]
      .filter(Boolean)
      .join(" ");

    const submissionData = {
      ...formData,
      fullName,
      state: "Enugu State",
    };

    try {
      setLoading(true);
      await registerInecOfficer(submissionData);
      setSubmittedOfficer({ ...submissionData });
      setFormData({
        firstName: "",
        middleName: "",
        lastName: "",
        email: "",
        phone: "",
        address: "",
        nin: "",
        state: "Enugu State",
        lga: "",
        ward: "",
        gender: "",
        qualification: "Degree",
        position: "APO",
        bankName: "",
        accountNumber: "",
        accountName: "",
        maritalStatus: "Single",
      });
    } catch (err: any) {
      console.error("Failed to submit INEC officer registration:", err);
      setError("Failed to submit registration. Please try again.");
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
            Directorate of Contact and Mobilization (DCM Enugu) registration portal for INEC Ad-hoc Officers across all 17 Local Government Areas of Enugu State.
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
              Thank you! Application details for <span className="font-bold text-gray-900">{submittedOfficer.fullName}</span> ({submittedOfficer.position}) have been received successfully.
            </p>

            <div className="mt-6 bg-emerald-50/70 rounded-2xl p-6 text-left border border-emerald-100 space-y-3 max-w-md mx-auto text-sm text-gray-700">
              <div className="flex justify-between border-b border-emerald-200/60 pb-2">
                <span className="text-xs font-bold uppercase text-emerald-800">Full Name</span>
                <span className="font-bold text-gray-900">{submittedOfficer.fullName}</span>
              </div>
              <div className="flex justify-between border-b border-emerald-200/60 pb-2">
                <span className="text-xs font-bold uppercase text-emerald-800">Position Applied</span>
                <span className="font-bold text-emerald-900">{submittedOfficer.position}</span>
              </div>
              <div className="flex justify-between border-b border-emerald-200/60 pb-2">
                <span className="text-xs font-bold uppercase text-emerald-800">Phone / Email</span>
                <span className="font-semibold text-gray-900">{submittedOfficer.phone}</span>
              </div>
              <div className="flex justify-between border-b border-emerald-200/60 pb-2">
                <span className="text-xs font-bold uppercase text-emerald-800">NIN</span>
                <span className="font-semibold text-gray-900">{submittedOfficer.nin}</span>
              </div>
              <div className="flex justify-between border-b border-emerald-200/60 pb-2">
                <span className="text-xs font-bold uppercase text-emerald-800">State / LGA</span>
                <span className="font-semibold text-gray-900">Enugu State ({submittedOfficer.lga} LGA)</span>
              </div>
              <div className="flex justify-between border-b border-emerald-200/60 pb-2">
                <span className="text-xs font-bold uppercase text-emerald-800">Qualification</span>
                <span className="font-semibold text-gray-900">{submittedOfficer.qualification}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-bold uppercase text-emerald-800">Bank Account</span>
                <span className="font-semibold text-gray-900">{submittedOfficer.bankName} - {submittedOfficer.accountNumber}</span>
              </div>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => setSubmittedOfficer(null)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm shadow-md transition-colors"
              >
                Register Another Applicant
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

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* SECTION 1: PERSONAL DETAILS */}
              <div>
                <div className="border-b border-gray-200 pb-3 mb-6 flex items-center gap-2">
                  <User className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-lg font-bold text-gray-900">1. Personal Information</h2>
                </div>

                <div className="space-y-6">
                  {/* Name Fields: First, Middle, Last */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Chidozie"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                        Middle Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Anthony"
                        value={formData.middleName}
                        onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Okafor"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm"
                      />
                    </div>
                  </div>

                  {/* Email & Phone Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                          <Mail className="h-5 w-5" />
                        </div>
                        <input
                          type="email"
                          required
                          placeholder="e.g. chidozie@example.com"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm"
                        />
                      </div>
                    </div>

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
                          className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Gender & Marital Status Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                        Gender <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formData.gender}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm bg-white"
                      >
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                        Marital Status <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                          <Heart className="h-5 w-5" />
                        </div>
                        <select
                          required
                          value={formData.maritalStatus}
                          onChange={(e) => setFormData({ ...formData, maritalStatus: e.target.value })}
                          className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm bg-white"
                        >
                          {MARITAL_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Residential Address */}
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                      Residential Address <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                        <MapPin className="h-5 w-5" />
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="e.g. No. 12 Independence Layout, Enugu"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm"
                      />
                    </div>
                  </div>

                  {/* NIN Number & Hardcoded State Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                        NIN Number (National Identification) <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                          <FileText className="h-5 w-5" />
                        </div>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 12345678901"
                          value={formData.nin}
                          onChange={(e) => setFormData({ ...formData, nin: e.target.value })}
                          className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                        State
                      </label>
                      <input
                        type="text"
                        readOnly
                        value="Enugu State"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-100 font-bold text-gray-700 text-sm cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: LOCATION & POSITION DETAILS */}
              <div>
                <div className="border-b border-gray-200 pb-3 mb-6 flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-lg font-bold text-gray-900">2. Location & Role Selection</h2>
                </div>

                <div className="space-y-6">
                  {/* LGA & Ward Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                        Enugu State LGA <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formData.lga}
                        onChange={(e) => setFormData({ ...formData, lga: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm bg-white"
                      >
                        <option value="">Select Local Government Area</option>
                        {ENUGU_LGAS.map((lga) => (
                          <option key={lga} value={lga}>
                            {lga} LGA
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                        Ward <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Ward 02 / Amechi"
                        value={formData.ward}
                        onChange={(e) => setFormData({ ...formData, ward: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm"
                      />
                    </div>
                  </div>

                  {/* Position & Qualification Dropdowns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Position Applied */}
                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                        Position Applied For <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                          <Briefcase className="h-5 w-5" />
                        </div>
                        <select
                          required
                          value={formData.position}
                          onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                          className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm bg-white font-semibold"
                        >
                          {POSITIONS.map((pos) => (
                            <option key={pos.value} value={pos.value}>
                              {pos.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Highest Qualification (Restricted to OND, HND, Degree) */}
                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                        Highest Qualification <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                          <GraduationCap className="h-5 w-5" />
                        </div>
                        <select
                          required
                          value={formData.qualification}
                          onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                          className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm bg-white font-semibold"
                        >
                          {QUALIFICATIONS.map((qual) => (
                            <option key={qual} value={qual}>
                              {qual}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: BANK DETAILS */}
              <div>
                <div className="border-b border-gray-200 pb-3 mb-6 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-lg font-bold text-gray-900">3. Bank & Disbursement Details</h2>
                </div>

                <div className="space-y-6">
                  {/* Bank Name */}
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                      Bank Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                        <Building className="h-5 w-5" />
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="e.g. First Bank, Access Bank, Zenith Bank"
                        value={formData.bankName}
                        onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm"
                      />
                    </div>
                  </div>

                  {/* Account Number & Account Name Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                        Account Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={10}
                        placeholder="e.g. 0123456789"
                        value={formData.accountNumber}
                        onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value.replace(/\D/g, "") })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm font-mono tracking-widest"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-2">
                        Account Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Must match name on bank account"
                        value={formData.accountName}
                        onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 text-gray-900 text-sm shadow-sm"
                      />
                    </div>
                  </div>
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
                      Submit INEC Officer Application
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
