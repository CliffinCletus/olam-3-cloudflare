// Public registration + pass retrieval, and coordinator/admin review (approve, bulk approve, reject).
import { Hono } from "hono";
import { z } from "zod";
import {
  type AppEnv,
  type User,
  REG_SELECT,
  assertBranchAccess,
  audit,
  clientIp,
  coordinatorBranch,
  displayName,
  getRegistration,
  getSettings,
  regOut,
  requireRoles,
  secret,
} from "../lib/ctx";
import { derivePassToken, fail, hashPassToken, newId, normalizePhone, nowIso, phoneKey, rateLimit, readBody, refCode } from "../lib/util";
import type { Env } from "../lib/util";

const regs = new Hono<AppEnv>();
const reviewer = requireRoles("super_admin", "coordinator");

const text = (label: string, min: number, max: number) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, { error: `${label} is required` })
    .min(min, { error: `${label} is too short` })
    .max(max, { error: `${label} is too long` });

const RegistrationIn = z.object({
  full_name: text("Full name", 2, 120),
  mobile: text("Mobile number", 5, 20).refine((v) => {
    const d = v.replace(/\D/g, "");
    return d.length >= 10 && d.length <= 15;
  }, { error: "Enter a valid mobile number (at least 10 digits)" }),
  email: z.string().trim().pipe(z.email({ error: "Enter a valid email address" })),
  branch_id: text("Branch", 1, 40),
  batch: text("Batch", 1, 80),
  batch_no: text("Batch No.", 1, 30),
  faculty_name: text("Faculty name", 2, 120),
  confirm: z.literal(true, { error: "You must confirm the information is accurate." }),
  privacy_accepted: z.literal(true, { error: "You must accept the privacy notice." }),
});

const DUP_EMAIL = "This email address is already registered. Use 'Retrieve my pass' with your reference to check your status.";
const DUP_PHONE = "This mobile number is already registered. Use 'Retrieve my pass' with your reference to check your status.";

regs.post("/registrations", async (c) => {
  const db = c.env.DB;
  const body = await readBody(c.req.raw, RegistrationIn);
  const settings = await getSettings(db);
  if (!settings.registration_open) fail(403, settings.closed_message);
  const branch = await db.prepare("SELECT id, name FROM branches WHERE id = ? AND active = 1").bind(body.branch_id).first<{ name: string }>();
  if (!branch) fail(400, "Invalid branch");
  await rateLimit(db, "register-ip", clientIp(c), 10, 60);

  const email = body.email.toLowerCase();
  const mobile = normalizePhone(body.mobile);
  const mKey = phoneKey(mobile);
  const dup = await db
    .prepare("SELECT email, mobile_key FROM registrations WHERE email = ? OR mobile_key = ? LIMIT 1")
    .bind(email, mKey)
    .first<{ email: string; mobile_key: string }>();
  if (dup) fail(409, dup.email === email ? DUP_EMAIL : DUP_PHONE);

  const now = nowIso();
  const id = newId("reg");
  for (let attempt = 0; attempt < 4; attempt++) {
    const reference = refCode();
    try {
      await db
        .prepare(
          `INSERT INTO registrations (id, reference, full_name, mobile, mobile_key, email, branch_id, batch, batch_no, faculty_name,
             privacy_accepted_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        )
        .bind(id, reference, body.full_name, mobile, mKey, email, body.branch_id, body.batch, body.batch_no, body.faculty_name, now, now, now)
        .run();
      await audit(db, null, "registration.submit", id, { reference });
      const row = await getRegistration(db, "id", id);
      return c.json(regOut(row));
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("registrations.reference")) continue; // reference collision: try another code
      if (msg.includes("registrations.email")) fail(409, DUP_EMAIL);
      if (msg.includes("registrations.mobile_key")) fail(409, DUP_PHONE);
      throw e;
    }
  }
  fail(500, "Could not create a registration reference. Please try again.");
});

const LookupIn = z.object({
  reference: z.string().trim().min(4, { error: "Enter your registration reference" }).max(20),
  email: z.string().trim().pipe(z.email({ error: "Enter the email you registered with" })),
});

/** Public retrieval: reference AND matching email. Returns status and, if approved, the derived pass token. */
regs.post("/registrations/lookup", async (c) => {
  const db = c.env.DB;
  await rateLimit(db, "lookup-ip", clientIp(c), 15, 60);
  const body = await readBody(c.req.raw, LookupIn);
  const reg = await getRegistration(db, "reference", body.reference.toUpperCase());
  if (!reg || reg.email.toLowerCase() !== body.email.toLowerCase()) fail(404, "No matching registration found");
  let pass_token: string | null = null;
  if (reg.status === "approved") {
    const p = await db.prepare("SELECT version FROM passes WHERE registration_id = ? AND active = 1").bind(reg.id).first<{ version: number }>();
    if (p) pass_token = await derivePassToken(secret(c.env), reg.id, p.version || 1);
  }
  return c.json({ registration: regOut(reg), pass_token, event: await eventInfo(db) });
});

async function eventInfo(db: D1Database) {
  const s = await getSettings(db);
  return { event_date: s.event_date, event_time_venue: s.event_time_venue };
}

/** Student device shows the live pass using the token as proof of possession (in the body). Does NOT check in. */
regs.post("/pass/verify", async (c) => {
  const db = c.env.DB;
  await rateLimit(db, "verify-ip", clientIp(c), 30, 60);
  const body = await readBody(c.req.raw, z.object({ token: z.string().min(10).max(200) }));
  const th = await hashPassToken(secret(c.env), body.token);
  const p = await db.prepare("SELECT registration_id FROM passes WHERE token_hash = ? AND active = 1").bind(th).first<{ registration_id: string }>();
  if (!p) fail(404, "Pass not found or revoked");
  const reg = await getRegistration(db, "id", p.registration_id);
  if (!reg || reg.status !== "approved") fail(403, "Pass not currently valid");
  return c.json({ registration: regOut(reg), event: await eventInfo(db) });
});

// --- Review --------------------------------------------------------------------------
regs.get("/registrations", reviewer, async (c) => {
  const user = c.get("user");
  const where: string[] = [];
  const params: unknown[] = [];
  const own = coordinatorBranch(user);
  const branchId = own ?? c.req.query("branch_id");
  if (branchId) { where.push("r.branch_id = ?"); params.push(branchId); }
  const status = c.req.query("status_") || c.req.query("status");
  if (status) {
    if (!["pending", "approved", "rejected"].includes(status)) fail(422, "Invalid status filter");
    where.push("r.status = ?"); params.push(status);
  }
  const q = (c.req.query("q") || "").trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    where.push(`(${["full_name", "faculty_name", "batch_no", "mobile", "email", "reference", "batch"].map((f) => `r.${f} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    for (let i = 0; i < 7; i++) params.push(like);
  }
  const sql = `${REG_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY r.created_at DESC LIMIT 5000`;
  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json(results.map(regOut));
});

regs.get("/registrations/:rid", reviewer, async (c) => {
  const reg = await getRegistration(c.env.DB, "id", c.req.param("rid"));
  if (!reg) fail(404, "Not found");
  assertBranchAccess(c.get("user"), reg.branch_id);
  return c.json(regOut(reg));
});

/** Create or re-issue a pass. Each (re)issue bumps the version so any older QR stops working. */
async function issuePass(env: Env, regId: string): Promise<void> {
  const db = env.DB;
  const existing = await db.prepare("SELECT * FROM passes WHERE registration_id = ?").bind(regId).first<any>();
  if (existing?.active) return; // already valid: approve is idempotent
  const version = existing ? (existing.version || 1) + 1 : 1;
  const th = await hashPassToken(secret(env), await derivePassToken(secret(env), regId, version));
  const now = nowIso();
  if (existing) {
    await db.prepare("UPDATE passes SET token_hash = ?, version = ?, active = 1, revoked_at = NULL, issued_at = ? WHERE registration_id = ?")
      .bind(th, version, now, regId).run();
  } else {
    await db.prepare("INSERT INTO passes (id, registration_id, token_hash, version, active, issued_at) VALUES (?, ?, ?, ?, 1, ?)")
      .bind(newId("ps"), regId, th, version, now).run();
  }
}

async function approveOne(env: Env, regId: string, user: User) {
  const now = nowIso();
  await env.DB.prepare(
    "UPDATE registrations SET status = 'approved', rejection_reason = NULL, reviewed_by = ?, reviewed_by_name = ?, reviewed_at = ?, updated_at = ? WHERE id = ?",
  ).bind(user.id, displayName(user), now, now, regId).run();
  await issuePass(env, regId);
  await audit(env.DB, user.id, "registration.approve", regId);
}

regs.post("/registrations/bulk-approve", reviewer, async (c) => {
  const user = c.get("user");
  const body = await readBody(c.req.raw, z.object({ ids: z.array(z.string()).min(1, { error: "Select at least one registration" }).max(200) }));
  let approved = 0;
  const skipped: { id: string; reason: string }[] = [];
  for (const rid of [...new Set(body.ids)]) {
    const reg = await c.env.DB.prepare("SELECT id, branch_id, status FROM registrations WHERE id = ?").bind(rid).first<any>();
    if (!reg) { skipped.push({ id: rid, reason: "not found" }); continue; }
    if (user.role === "coordinator" && reg.branch_id !== user.branch_id) { skipped.push({ id: rid, reason: "not your branch" }); continue; }
    if (reg.status !== "pending") { skipped.push({ id: rid, reason: `already ${reg.status}` }); continue; }
    await approveOne(c.env, rid, user);
    approved++;
  }
  await audit(c.env.DB, user.id, "registration.bulk_approve", null, { count: approved });
  return c.json({ approved, skipped });
});

regs.post("/registrations/:rid/approve", reviewer, async (c) => {
  const user = c.get("user");
  const rid = c.req.param("rid");
  const reg = await c.env.DB.prepare("SELECT id, branch_id FROM registrations WHERE id = ?").bind(rid).first<any>();
  if (!reg) fail(404, "Not found");
  assertBranchAccess(user, reg.branch_id);
  await approveOne(c.env, rid, user);
  return c.json(regOut(await getRegistration(c.env.DB, "id", rid)));
});

regs.post("/registrations/:rid/reject", reviewer, async (c) => {
  const user = c.get("user");
  const rid = c.req.param("rid");
  const body = await readBody(c.req.raw, z.object({ reason: z.string().trim().min(3, { error: "Give a reason (at least 3 characters)" }).max(400) }));
  const db = c.env.DB;
  const reg = await db.prepare("SELECT id, branch_id FROM registrations WHERE id = ?").bind(rid).first<any>();
  if (!reg) fail(404, "Not found");
  assertBranchAccess(user, reg.branch_id);
  const now = nowIso();
  await db.batch([
    db.prepare("UPDATE registrations SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_by_name = ?, reviewed_at = ?, updated_at = ? WHERE id = ?")
      .bind(body.reason, user.id, displayName(user), now, now, rid),
    // Revoke any existing pass so a previously approved QR is refused immediately.
    db.prepare("UPDATE passes SET active = 0, revoked_at = ? WHERE registration_id = ?").bind(now, rid),
  ]);
  await audit(db, user.id, "registration.reject", rid, { reason: body.reason });
  return c.json(regOut(await getRegistration(db, "id", rid)));
});

export default regs;
