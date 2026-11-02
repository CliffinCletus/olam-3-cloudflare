// QR pass: device storage and QR images (kept free of jsPDF so it stays small).
import QRCode from "qrcode";
import type { EventInfo, Registration } from "../api";

export type SavedPass = { token: string; registration: Registration; event?: EventInfo | null; saved_at: string };

const key = (ref: string) => `olam3_pass_${ref.toUpperCase().replace(/[^A-Z0-9-]/g, "")}`;

// Some browsers block localStorage (WhatsApp / Instagram in-app browsers, private tabs, blocked site data).
// Every write is mirrored in memory so the pass still opens in this tab; it just won't survive a reload.
const mem = new Map<string, string>();
let persisted = true;
function store(k: string, v: string | null) {
  if (v === null) mem.delete(k); else mem.set(k, v);
  try {
    if (v === null) localStorage.removeItem(k);
    else { localStorage.setItem(k, v); persisted = localStorage.getItem(k) === v; }
  } catch { if (v !== null) persisted = false; }
}
function fetchKey(k: string): string | null {
  try { const v = localStorage.getItem(k); if (v !== null) return v; } catch { /* storage blocked */ }
  return mem.get(k) ?? null;
}
/** False when the last save only reached memory: the student should download the pass. */
export const passSavedOnDevice = () => persisted;

/** The token lives on this device only (never in the URL). */
export function savePass(p: Omit<SavedPass, "saved_at">) {
  store(key(p.registration.reference), JSON.stringify({ ...p, saved_at: new Date().toISOString() }));
}
export function loadPass(ref: string): SavedPass | null {
  try {
    const raw = fetchKey(key(ref));
    return raw ? (JSON.parse(raw) as SavedPass) : null;
  } catch { return null; }
}
export function forgetPass(ref: string) {
  store(key(ref), null);
}

// --- The student on this device: the app reopens straight to their status / pass ----------
export type Me = { email: string; mobile: string; reference?: string };
const ME_KEY = "olam3_me";

export function saveMe(me: Me) {
  store(ME_KEY, JSON.stringify(me));
}
export function loadMe(): Me | null {
  try {
    const raw = fetchKey(ME_KEY);
    const me = raw ? (JSON.parse(raw) as Me) : null;
    return me?.email && me?.mobile ? me : null;
  } catch { return null; }
}
/** "Not you?": forget the student and their saved pass on this device. */
export function forgetMe() {
  const me = loadMe();
  if (me?.reference) forgetPass(me.reference);
  store(ME_KEY, null);
}

// --- QR with the OLAM logo in the middle ---------------------------------------------------
// Error correction H tolerates ~30% damage; the logo tile covers well under that (checked with a decoder).
const LOGO_TILE = 0.24;
let logoImg: Promise<HTMLImageElement | null> | null = null;
function logo(): Promise<HTMLImageElement | null> {
  logoImg ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/logo-qr.png";
  });
  return logoImg;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function qrDataUrl(token: string, size = 440): Promise<string> {
  const cv = document.createElement("canvas");
  await QRCode.toCanvas(cv, token, { errorCorrectionLevel: "H", margin: 1, width: size, color: { dark: "#2E0709", light: "#FFFFFF" } });
  const img = await logo();
  if (img) {
    const ctx = cv.getContext("2d")!;
    const w = cv.width;
    const tile = Math.round(w * LOGO_TILE);
    const x = Math.round((w - tile) / 2);
    roundRect(ctx, x, x, tile, tile, tile * 0.14);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    const pad = tile * 0.08;
    const box = tile - pad * 2;
    const scale = Math.min(box / img.naturalWidth, box / img.naturalHeight);
    const lw = img.naturalWidth * scale, lh = img.naturalHeight * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, (w - lw) / 2, (w - lh) / 2, lw, lh);
  }
  return cv.toDataURL("image/png");
}

export function formatEventDate(d?: string | null) {
  if (!d) return "";
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}
