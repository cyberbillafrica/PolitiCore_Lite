# NOTIFICATIONS AND ANNOUNCEMENTS SYSTEM ARCHITECTURE

## Overview

The DCM Enugu platform consolidates directorate broadcasts, announcements, and system alerts into a unified **Notification Bell Drawer** and **Sonner Toast System**.

---

## 1. Notification Bell Drawer (`src/components/notifications/NotificationBell.tsx`)

### Location:
Embedded in the sticky top header bar across all portal pages (`/portal/*`).

### Data Flow:
1. Component invokes `getUserAnnouncements(profile)` from `src/lib/firebase/firestore.ts`.
2. Announcements are filtered based on user membership type or role.
3. Unread counts are computed against client-side `localStorage` array `dcm_read_notifications`.
4. The drawer allows members to click individual notifications to mark them read or use **"Mark all read"**.

---

## 2. In-App Toast Notifications (`src/components/providers/ToastProvider.tsx`)

### Library:
[Sonner](https://sonner.emilkowal.si/)

### Integration:
* `ToastProvider` mounted at the root level in `src/app/layout.tsx`.
* Triggers pop-up toast alerts (`toast.success()`, `toast.error()`, `toast.info()`) across admin forms, settings updates, structure modifications, and registration flows.
