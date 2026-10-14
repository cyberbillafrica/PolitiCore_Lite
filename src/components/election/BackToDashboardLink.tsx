"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/*
 * Header back control for every election surface. `/portal/dashboard`
 * is the correct target for all roles: the route renders the
 * dashboard that matches the signed-in role (officers land on
 * ElectionOfficerDashboard automatically).
 */
export default function BackToDashboardLink({
  label = "Back to Dashboard",
}: {
  label?: string;
}) {
  return (
    <Link
      href="/portal/dashboard"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-apc-primary transition-colors hover:text-apc-dark hover:underline"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
