"use client";

import ElectionAccessGuard from "./ElectionAccessGuard";

export default function ElectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ElectionAccessGuard>{children}</ElectionAccessGuard>;
}
