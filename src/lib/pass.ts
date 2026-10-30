// QR pass: device storage and QR images (kept free of jsPDF so it stays small).
import QRCode from "qrcode";
import type { EventInfo, Registration } from "../api";

export type SavedPass = { token: string; registration: Registration; event?: EventInfo | null; saved_at: string };

const key = (ref: string) => `olam3_pass_${ref.toUpperCase().replace(/[^A-Z0-9-]/g, "")}`;

/** The token lives on this device only (never in the URL). */
export function savePass(p: Omit<SavedPass, "saved_at">) {
  try { localStorage.setItem(key(p.registration.reference), JSON.stringify({ ...p, saved_at: new Date().toISOString() })); } catch { /* storage blocked */ }
}
export function loadPass(ref: string): SavedPass | null {
  try {
    const raw = localStorage.getItem(key(ref));
    return raw ? (JSON.parse(raw) as SavedPass) : null;
  } catch { return null; }
}
export function forgetPass(ref: string) {
  try { localStorage.removeItem(key(ref)); } catch { /* ignore */ }
}

export const qrDataUrl = (token: string, size = 440) =>
  QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 1, width: size, color: { dark: "#0B192C", light: "#FFFFFF" } });

export function formatEventDate(d?: string | null) {
  if (!d) return "";
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

