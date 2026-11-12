import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Nombre para mostrar: apodo si tiene, si no el nombre. */
export function displayName(p: { first_name: string; nickname?: string | null }) {
  return p.nickname?.trim() || p.first_name;
}

export function initials(p: { first_name: string; last_name: string }) {
  return `${p.first_name[0] ?? ""}${p.last_name[0] ?? ""}`.toUpperCase();
}
