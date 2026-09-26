import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { parties } from "@/lib/constants";

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-NG").format(value);
}

