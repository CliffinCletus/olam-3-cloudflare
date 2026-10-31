// App types, auth middleware and shared data helpers.
import type { Context, MiddlewareHandler } from "hono";
import { sign, verify } from "hono/jwt";
import { type Env, fail, newId, nowIso, randomHex } from "./util";

export type Role = "super_admin" | "coordinator" | "scanner";
export const STAFF_ROLES: Role[] = ["super_admin", "coordinator", "scanner"];

export type User = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  branch_id: string | null;
  active: boolean;
  can_export: boolean;
  must_change_password: boolean;
};

export type AppEnv = { Bindings: Env; Variables: { user: User } };
export type Ctx = Context<AppEnv>;

export const issuer = (env: Env) => env.JWT_ISSUER || "olam3-api";

export function secret(env: Env): string {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 16) fail(500, "Server is not configured (JWT_SECRET missing).");
  return env.JWT_SECRET;
}

export function userOut(row: any): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? null,
    role: row.role,
    branch_id: row.branch_id ?? null,
    active: !!row.active,
    can_export: !!row.can_export,
    must_change_password: !!row.must_change_password,
  };
}

export async function makeToken(env: Env, user: User, lifetimeMin = 60 * 8): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: user.id, role: user.role, branch_id: user.branch_id, iat: now, exp: now + lifetimeMin * 60, iss: issuer(env), jti: randomHex(16) },
    secret(env),
    "HS256",
  );
}

async function currentUser(c: Ctx): Promise<User> {
  const h = c.req.header("authorization") || "";
  const [scheme, token] = h.split(" ");
  if (!token || scheme.toLowerCase() !== "bearer") fail(401, "Not authenticated");
  let p: any;
  try {
    p = await verify(token, secret(c.env), { alg: "HS256", iss: issuer(c.env) });
  } catch {
    fail(401, "Invalid or expired token");
  }
  if (!p?.sub || !p?.role || !p?.jti) fail(401, "Invalid token");
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(p.sub).first();
  if (!row || !row.active || row.role !== p.role) fail(401, "Invalid token");
  const user = userOut(row);
  // Accounts with a default / admin-set password may only change it until they do.
  const path = new URL(c.req.url).pathname;
  if (user.must_change_password && path !== "/api/auth/me" && path !== "/api/auth/change-password") {
    fail(403, "Password change required");
  }
  return user;
}

export const authed: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set("user", await currentUser(c));
  await next();
};

export const requireRoles = (...roles: Role[]): MiddlewareHandler<AppEnv> => async (c, next) => {
  const u = await currentUser(c);
  if (!roles.includes(u.role)) fail(403, "Insufficient permissions");
  c.set("user", u);
  await next();
};

export const clientIp = (c: Ctx) => c.req.header("cf-connecting-ip") || c.req.header("x-real-ip") || "unknown";

export async function audit(db: D1Database, actorId: string | null, action: string, target: string | null = null, meta: Record<string, unknown> = {}) {
  await db
    .prepare("INSERT INTO audit_logs (id, actor_id, action, target_id, timestamp, meta) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(newId("al"), actorId, action, target, nowIso(), JSON.stringify(meta))
    .run();
}

export const displayName = (u: User) => u.name || u.email;

// --- Registrations ---------------------------------------------------------------
export const REG_SELECT = `SELECT r.*, b.name AS branch_name, a.checked_in_at AS att_checked_in_at
  FROM registrations r
  LEFT JOIN branches b ON b.id = r.branch_id
  LEFT JOIN attendance a ON a.registration_id = r.id`;

export function regOut(r: any) {
  return {
    id: r.id,
    reference: r.reference,
    full_name: r.full_name,
    mobile: r.mobile,
    email: r.email,
    branch_id: r.branch_id,
    branch_name: r.branch_name ?? null,
    batch: r.batch,
    batch_no: r.batch_no ?? null,
    faculty_name: r.faculty_name ?? null,
    status: r.status,
    rejection_reason: r.rejection_reason ?? null,
    created_at: r.created_at,
    reviewed_by_name: r.reviewed_by_name ?? null,
    reviewed_at: r.reviewed_at ?? null,
    checked_in: !!r.att_checked_in_at,
    checked_in_at: r.att_checked_in_at ?? null,
  };
}

export async function getRegistration(db: D1Database, where: "id" | "reference", value: string) {
  return db.prepare(`${REG_SELECT} WHERE r.${where} = ?`).bind(value).first<any>();
}

/** WHERE clause for the registrations list and its CSV export: branch (forced for coordinators), status, free-text search. */
export function registrationFilter(user: User, q: { branch_id?: string; status?: string; q?: string }) {
  const where: string[] = [];
  const params: unknown[] = [];
  const branchId = coordinatorBranch(user) ?? q.branch_id;
  if (branchId) { where.push("r.branch_id = ?"); params.push(branchId); }
  if (q.status) {
    if (!["pending", "approved", "rejected"].includes(q.status)) fail(422, "Invalid status filter");
    where.push("r.status = ?"); params.push(q.status);
  }
  const text = (q.q || "").trim();
  if (text) {
    const like = `%${text.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    const fields = ["full_name", "faculty_name", "batch_no", "mobile", "email", "reference", "batch"];
    where.push(`(${fields.map((f) => `r.${f} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    for (let i = 0; i < fields.length; i++) params.push(like);
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

/** Coordinators are always scoped to their own branch. */
export function coordinatorBranch(user: User): string | null {
  if (user.role !== "coordinator") return null;
  if (!user.branch_id) fail(403, "Coordinator not assigned a branch");
  return user.branch_id;
}

export function assertBranchAccess(user: User, branchId: string) {
  if (user.role === "coordinator" && branchId !== user.branch_id) fail(403, "Not your branch");
}

export function canExport(user: User) {
  if (user.role === "coordinator" && !user.can_export) fail(403, "CSV download has not been enabled for your account by the admin");
}

// --- Settings ---------------------------------------------------------------------
export const DEFAULT_PRIVACY =
  "Delta Academy collects your name, mobile number, email, branch, batch, batch number and faculty name " +
  "only to verify you as a student and to manage entry to OLAM 3.0. Your details are visible only to the " +
  "event admin and your branch coordinator, are never sold or shared, and will be deleted after the event.";
export const DEFAULT_CLOSED = "Registration for OLAM 3.0 is currently closed. Please contact your branch coordinator.";

export async function getSettings(db: D1Database) {
  const s = await db.prepare("SELECT * FROM settings WHERE id = 'event'").first<any>();
  return {
    registration_open: s ? !!s.registration_open : true,
    closed_message: s?.closed_message || DEFAULT_CLOSED,
    privacy_notice: s?.privacy_notice || DEFAULT_PRIVACY,
    event_date: s?.event_date ?? null,
    event_time_venue: s?.event_time_venue ?? null,
    updated_at: s?.updated_at ?? null,
    updated_by_name: s?.updated_by_name ?? null,
  };
}
