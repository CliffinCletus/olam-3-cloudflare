// Shared helpers: errors, ids, crypto (PBKDF2 passwords, HMAC pass tokens), CSV, rate limiting.
import type { z } from "zod";

export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  JWT_ISSUER?: string;
  INITIAL_ADMIN_EMAIL?: string;
  INITIAL_ADMIN_PASSWORD?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
};

export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}
export function fail(status: number, detail: string): never {
  throw new ApiError(status, detail);
}

export const nowIso = () => new Date().toISOString();

const enc = new TextEncoder();

export function randomHex(bytes: number): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export const newId = (prefix: string, bytes = 6) => `${prefix}-${randomHex(bytes)}`;
export const refCode = () => "OLM-" + randomHex(3).toUpperCase();

function b64(buf: ArrayBuffer | Uint8Array): string {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const b64url = (buf: ArrayBuffer | Uint8Array) => b64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64url = (s: string) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

// --- Passwords: PBKDF2-SHA256 (Workers caps iterations at 100k) -------------
const PBKDF2_ITER = 100_000;

async function pbkdf2(pw: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const h = await pbkdf2(pw, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(h)}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = (stored || "").split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const h = await pbkdf2(pw, unb64(salt), Number(iter));
  return timingSafeEqual(h, unb64(hash));
}

export const passwordStrong = (pw: string) => pw.length >= 10 && /[A-Za-z]/.test(pw) && /\d/.test(pw);

// --- HMAC helpers for QR pass tokens ------------------------------------------
async function hmac(secret: string, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

/** DB stores only this hash of a pass token. */
export async function hashPassToken(secret: string, token: string): Promise<string> {
  const h = await hmac(secret, token);
  return [...h].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Pass token is derived, never stored: HMAC(secret, reg_id:version). Re-issue bumps version. */
export async function derivePassToken(secret: string, registrationId: string, version: number): Promise<string> {
  const mac = await hmac("pass-v1:" + secret, `${registrationId}:${version}`);
  return b64url(mac.slice(0, 24));
}

// --- Input helpers --------------------------------------------------------------
export const normalizePhone = (p: string) => (p || "").replace(/[^0-9+]/g, "");
export const phoneKey = (p: string) => (p || "").replace(/\D/g, "").slice(-10);

export async function readBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    fail(400, "Invalid request body");
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const issue = r.error.issues[0];
    fail(422, issue?.message || "Please check the form and try again.");
  }
  return (r as { data: T }).data;
}

// --- CSV --------------------------------------------------------------------------
/** Neutralise spreadsheet formulas in user-supplied cells (CSV injection). */
export function csvSafe(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}
export function toCsv(rows: unknown[][]): string {
  // UTF-8 BOM so Excel shows non-English names correctly.
  return "﻿" + rows.map((r) => r.map((v) => `"${csvSafe(v).replace(/"/g, '""')}"`).join(",")).join("\r\n") + "\r\n";
}
export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Cache-Control": "no-store",
    },
  });
}

// --- Rate limiting (D1 sliding window; fine for event-scale traffic) ---------------
export async function countHits(db: D1Database, k: string, windowS: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM rate_hits WHERE k = ? AND t > ?")
    .bind(k, Date.now() - windowS * 1000)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
export async function addHit(db: D1Database, k: string): Promise<void> {
  const t = Date.now();
  await db.prepare("INSERT INTO rate_hits (k, t) VALUES (?, ?)").bind(k, t).run();
  if (Math.random() < 0.02) await db.prepare("DELETE FROM rate_hits WHERE t < ?").bind(t - 3_600_000).run();
}
export async function rateLimit(db: D1Database, bucket: string, key: string, limit: number, windowS: number) {
  const k = `${bucket}:${key}`;
  if ((await countHits(db, k, windowS)) >= limit) fail(429, "Too many attempts. Please wait a minute and try again.");
  await addHit(db, k);
}
