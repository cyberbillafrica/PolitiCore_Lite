"use client";

import { Toaster, toast } from "sonner";

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        style: {
          borderRadius: "1rem",
          padding: "1rem",
        },
      }}
    />
  );
}

export { toast };

