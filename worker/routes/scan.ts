// Gate scanning, attendance log and recent check-ins.
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, type User, audit, coordinatorBranch, displayName, requireRoles, secret } from "../lib/ctx";
import { hashPassToken, newId, nowIso, readBody } from "../lib/util";
import type { Env } from "../lib/util";

const scan = new Hono<AppEnv>();

type ScanReg = { full_name: string; reference: string; batch: string; branch_id: string; branch_name: string | null };

const REG_FOR_SCAN = `SELECT r.id, r.status, r.full_name, r.reference, r.batch, r.branch_id, b.name AS branch_name
  FROM registrations r LEFT JOIN branches b ON b.id = r.branch_id`;

const scanReg = (r: any): ScanReg => ({ full_name: r.full_name, reference: r.reference, batch: r.batch, branch_id: r.branch_id, branch_name: r.branch_name ?? null });

async function doScan(env: Env, raw: string, station: string, user: User): Promise<any> {
  const db = env.DB;
  let p: any = null;
  let reg: any = null;
  if (/^OLM-[0-9A-F]{6}$/i.test(raw)) {
    // Staff manual fallback: look up by registration reference.
    reg = await db.prepare(`${REG_FOR_SCAN} WHERE r.reference = ?`).bind(raw.toUpperCase()).first();
    if (!reg) return { result: "INVALID", message: "Reference not found" };
    p = await db.prepare("SELECT * FROM passes WHERE registration_id = ?").bind(reg.id).first();
    if (!p) return { result: "NOT_APPROVED", message: `Registration is ${reg.status}`, registration: scanReg(reg) };
  } else {
    p = await db.prepare("SELECT * FROM passes WHERE token_hash = ?").bind(await hashPassToken(secret(env), raw)).first();
    if (!p) return { result: "INVALID", message: "QR not recognized" };
    reg = await db.prepare(`${REG_FOR_SCAN} WHERE r.id = ?`).bind(p.registration_id).first();
    if (!reg) return { result: "INVALID", message: "Registration missing" };
  }
  if (!p.active) return { result: "REVOKED", message: "This pass has been revoked", registration: scanReg(reg) };
  if (reg.status !== "approved") return { result: "NOT_APPROVED", message: `Registration is ${reg.status}`, registration: scanReg(reg) };

  // Unique registration_id makes check-in duplicate-safe even with two gates scanning at once.
  const now = nowIso();
  const ins = await db
    .prepare("INSERT INTO attendance (id, registration_id, checked_in_at, scanner_id, scanner_name, station) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(registration_id) DO NOTHING")
    .bind(newId("att"), reg.id, now, user.id, displayName(user), station)
    .run();
  if (ins.meta.changes === 1) {
    await audit(db, user.id, "attendance.checkin", reg.id, { station });
    return { result: "VALID", message: "Entry approved", checked_in_at: now, registration: scanReg(reg) };
  }
  const existing = await db.prepare("SELECT checked_in_at, scanner_name FROM attendance WHERE registration_id = ?").bind(reg.id).first<any>();
  return {
    result: "ALREADY_CHECKED_IN",
    message: "Pass already used",
    checked_in_at: existing?.checked_in_at ?? null,
    scanner_name: existing?.scanner_name ?? null,
    registration: scanReg(reg),
  };
}

const ScanIn = z.object({
  token: z.string().trim().min(4, { error: "Scan a QR pass or type a reference" }).max(200),
  station: z.string().max(50).nullish(),
});

scan.post("/scan", requireRoles("super_admin", "coordinator", "scanner"), async (c) => {
  const user = c.get("user");
  const body = await readBody(c.req.raw, ScanIn);
  const station = body.station || "station-1";
  const res = await doScan(c.env, body.token, station, user);
  if (res.result !== "VALID") {
    // Log every refused / duplicate attempt (no raw token stored).
    const r: Partial<ScanReg> = res.registration || {};
    await c.env.DB.prepare(
      "INSERT INTO scan_attempts (id, result, reference, full_name, batch, branch_id, branch_name, attempted_at, scanner_id, scanner_name, station) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(newId("sa"), res.result, r.reference ?? null, r.full_name ?? null, r.batch ?? null, r.branch_id ?? null, r.branch_name ?? null, nowIso(), user.id, displayName(user), station)
      .run();
  }
  return c.json(res);
});

/** Full check-in log + refused/duplicate attempts, branch-scoped. */
scan.get("/attendance", requireRoles("super_admin", "coordinator"), async (c) => {
  const user = c.get("user");
  const branchId = coordinatorBranch(user) ?? c.req.query("branch_id") ?? "";
  const db = c.env.DB;
  const checkins = await db
    .prepare(
      `SELECT a.id, a.checked_in_at, a.scanner_name, a.station, r.full_name, r.reference, r.batch, b.name AS branch_name
       FROM attendance a JOIN registrations r ON r.id = a.registration_id LEFT JOIN branches b ON b.id = r.branch_id
       ${branchId ? "WHERE r.branch_id = ?" : ""} ORDER BY a.checked_in_at DESC LIMIT 5000`,
    )
    .bind(...(branchId ? [branchId] : []))
    .all();
  const attempts = await db
    .prepare(`SELECT * FROM scan_attempts ${branchId ? "WHERE branch_id = ?" : ""} ORDER BY attempted_at DESC LIMIT 2000`)
    .bind(...(branchId ? [branchId] : []))
    .all<any>();
  return c.json({
    checkins: checkins.results,
    attempts: attempts.results,
    duplicate_count: attempts.results.filter((x) => x.result === "ALREADY_CHECKED_IN").length,
  });
});

scan.get("/scan/history", requireRoles("super_admin", "coordinator", "scanner"), async (c) => {
  const branchId = coordinatorBranch(c.get("user"));
  const { results } = await c.env.DB
    .prepare(
      `SELECT a.*, r.full_name, r.reference, r.batch, b.name AS branch_name
       FROM attendance a JOIN registrations r ON r.id = a.registration_id LEFT JOIN branches b ON b.id = r.branch_id
       ${branchId ? "WHERE r.branch_id = ?" : ""} ORDER BY a.checked_in_at DESC LIMIT 100`,
    )
    .bind(...(branchId ? [branchId] : []))
    .all();
  return c.json(results);
});

export default scan;
