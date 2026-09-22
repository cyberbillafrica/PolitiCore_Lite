# SYSTEM ARCHITECTURE & REBRANDING SUMMARY

## Project Overview

* **Application Name:** DCM Enugu — Directorate of Contact and Mobilization
* **Tagline:** Mobilizing for Good Governance
* **Framework:** Next.js 16 (App Router with Turbopack)
* **Backend & Storage:** Firebase (Authentication, Firestore Data & Site Settings)
* **Styling:** Tailwind CSS with Lucide Icons and Light/Dark Mode Theme Provider

---

## Key Modules & Component Mapping

1. **Root Layout & Global Guards (`src/app/layout.tsx`):**
   * Wraps application in `AuthProvider`, `ThemeProvider`, `MaintenanceGuard`, and `ToastProvider`.

2. **Maintenance Mode Guard (`src/components/providers/MaintenanceGuard.tsx`):**
   * Intercepts public requests when Maintenance Mode is ON.
   * Renders either the **Maintenance Page** or **Dark Blue Screen**.
   * Bypasses `/portal/*`, `/login`, `/api/*`, and static assets to guarantee administrative access.

3. **Site Settings Control (`src/lib/firebase/site-settings.ts`):**
   * Firestore collection `site_settings/general` with `localStorage` fallback caching.
   * Controls hero copy, hero banner image, brand logo, maintenance toggles, header notices, and footer contacts.

4. **Structure Roster (`src/app/structure/page.tsx` & `src/components/StructureMemberModal.tsx`):**
   * Displays State, Zonal, and LGA structure members.
   * Interactive detail popup with full-screen face image preview.

5. **INEC Officer Portal (`src/app/register-inec-officer/page.tsx` & `/portal/admin/inec-officers`):**
   * Candidate application form with NIN, address, qualifications, and bank account fields.
   * Admin portal roster with filters, detailed popup, CSV export, and PDF/Print report generation.
