// Public lookups (branches, batches, settings) and super-admin management: event settings, branches, batches, staff, audit log.
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, audit, displayName, getSettings, requireRoles, userOut } from "../lib/ctx";
import { fail, hashPassword, newId, nowIso, readBody } from "../lib/util";

const admin = new Hono<AppEnv>();
const superAdmin = requireRoles("super_admin");
const anyStaff = requireRoles("super_admin", "coordinator", "scanner");

const branchOut = (b: any) => ({ id: b.id, name: b.name, active: !!b.active, created_at: b.created_at });
const batchOut = (b: any) => ({ id: b.id, name: b.name, sort_order: b.sort_order ?? 0 });
const BATCH_ORDER = "ORDER BY sort_order, name COLLATE NOCASE";

const isUnique = (e: any) => /UNIQUE constraint failed/i.test(String(e?.message || e));

// --- Public ---------------------------------------------------------------------------
admin.get("/public/branches", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM branches WHERE active = 1 ORDER BY created_at, name").all();
  return c.json(results.map(branchOut));
});

admin.get("/public/batches", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM batches ${BATCH_ORDER}`).all();
  return c.json(results.map(batchOut));
});

admin.get("/public/settings", async (c) => {
  const s = await getSettings(c.env.DB);
  return c.json({ registration_open: s.registration_open, closed_message: s.closed_message, privacy_notice: s.privacy_notice });
});

// --- Event settings ---------------------------------------------------------------------
const SettingsIn = z.object({
  registration_open: z.boolean(),
  closed_message: z.string().trim().min(3, { error: "Closed message must be at least 3 characters" }).max(400),
  privacy_notice: z.string().trim().min(20, { error: "Privacy notice must be at least 20 characters" }).max(3000),
  event_date: z
    .string()
    .trim()
    .nullish()
    .refine((v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), { error: "Event date must be YYYY-MM-DD" }),
  event_time_venue: z.string().trim().max(200).nullish(),
});

admin.get("/settings", superAdmin, async (c) => c.json(await getSettings(c.env.DB)));

admin.put("/settings", superAdmin, async (c) => {
  const user = c.get("user");
  const b = await readBody(c.req.raw, SettingsIn);
  await c.env.DB.prepare(
    `INSERT INTO settings (id, registration_open, closed_message, privacy_notice, event_date, event_time_venue, updated_at, updated_by_name)
     VALUES ('event', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET registration_open = excluded.registration_open, closed_message = excluded.closed_message,
       privacy_notice = excluded.privacy_notice, event_date = excluded.event_date, event_time_venue = excluded.event_time_venue,
       updated_at = excluded.updated_at, updated_by_name = excluded.updated_by_name`,
  )
    .bind(b.registration_open ? 1 : 0, b.closed_message, b.privacy_notice, b.event_date || null, b.event_time_venue || null, nowIso(), displayName(user))
    .run();
  await audit(c.env.DB, user.id, "settings.update", "event", { registration_open: b.registration_open });
  return c.json(await getSettings(c.env.DB));
});

// --- Branches ---------------------------------------------------------------------------
const BranchIn = z.object({
  name: z.string().trim().min(1, { error: "Name cannot be blank" }).max(80),
  active: z.boolean().default(true),
});

admin.get("/branches", anyStaff, async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM branches ORDER BY created_at, name").all();
  return c.json(results.map(branchOut));
});

admin.post("/branches", superAdmin, async (c) => {
  const b = await readBody(c.req.raw, BranchIn);
  const doc = { id: newId("br", 4), name: b.name, active: b.active, created_at: nowIso() };
  try {
    await c.env.DB.prepare("INSERT INTO branches (id, name, active, created_at) VALUES (?, ?, ?, ?)").bind(doc.id, doc.name, doc.active ? 1 : 0, doc.created_at).run();
  } catch (e) {
    if (isUnique(e)) fail(409, "Branch name already exists");
    throw e;
  }
  await audit(c.env.DB, c.get("user").id, "branch.create", doc.id);
  return c.json(doc);
});

admin.patch("/branches/:bid", superAdmin, async (c) => {
  const bid = c.req.param("bid");
  const b = await readBody(c.req.raw, BranchIn);
  try {
    const r = await c.env.DB.prepare("UPDATE branches SET name = ?, active = ? WHERE id = ?").bind(b.name, b.active ? 1 : 0, bid).run();
    if (!r.meta.changes) fail(404, "Not found");
  } catch (e) {
    if (isUnique(e)) fail(409, "Another branch already has this name");
    throw e;
  }
  await audit(c.env.DB, c.get("user").id, "branch.update", bid);
  return c.json(branchOut(await c.env.DB.prepare("SELECT * FROM branches WHERE id = ?").bind(bid).first()));
});

// --- Batches (super admins can add, rename, reorder and delete) ---------------------------
const BatchIn = z.object({ name: z.string().trim().min(1, { error: "Name cannot be blank" }).max(80) });

admin.get("/batches", anyStaff, async (c) => {
  const db = c.env.DB;
  const { results } = await db
    .prepare(`SELECT bt.*, (SELECT COUNT(*) FROM registrations r WHERE r.batch = bt.name) AS registrations FROM batches bt ${BATCH_ORDER}`)
    .all<any>();
  return c.json(results.map((b) => ({ ...batchOut(b), registrations: b.registrations })));
});

admin.post("/batches", superAdmin, async (c) => {
  const b = await readBody(c.req.raw, BatchIn);
  const db = c.env.DB;
  const max = await db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM batches").first<{ m: number }>();
  const doc = { id: newId("bt", 4), name: b.name, sort_order: (max?.m ?? 0) + 1 };
  try {
    await db.prepare("INSERT INTO batches (id, name, sort_order) VALUES (?, ?, ?)").bind(doc.id, doc.name, doc.sort_order).run();
  } catch (e) {
    if (isUnique(e)) fail(409, "Batch already exists");
    throw e;
  }
  await audit(db, c.get("user").id, "batch.create", doc.id, { name: doc.name });
  return c.json(doc);
});

/** Rename a batch. Registrations store the batch name, so they are renamed with it. */
admin.patch("/batches/:id", superAdmin, async (c) => {
  const id = c.req.param("id");
  const b = await readBody(c.req.raw, BatchIn);
  const db = c.env.DB;
  const cur = await db.prepare("SELECT * FROM batches WHERE id = ?").bind(id).first<any>();
  if (!cur) fail(404, "Batch not found");
  if (cur.name !== b.name) {
    try {
      const res = await db.batch([
        db.prepare("UPDATE batches SET name = ? WHERE id = ?").bind(b.name, id),
        db.prepare("UPDATE registrations SET batch = ?, updated_at = ? WHERE batch = ?").bind(b.name, nowIso(), cur.name),
        db.prepare("UPDATE scan_attempts SET batch = ? WHERE batch = ?").bind(b.name, cur.name),
      ]);
      await audit(db, c.get("user").id, "batch.rename", id, { from: cur.name, to: b.name, registrations: res[1].meta.changes });
    } catch (e) {
      if (isUnique(e)) fail(409, "Another batch already has this name");
      throw e;
    }
  }
  return c.json(batchOut(await db.prepare("SELECT * FROM batches WHERE id = ?").bind(id).first()));
});

/** Save the display order of batches on the registration form. */
admin.put("/batches/order", superAdmin, async (c) => {
  const b = await readBody(c.req.raw, z.object({ ids: z.array(z.string()).min(1).max(200) }));
  const db = c.env.DB;
  await db.batch(b.ids.map((id, i) => db.prepare("UPDATE batches SET sort_order = ? WHERE id = ?").bind(i + 1, id)));
  await audit(db, c.get("user").id, "batch.reorder", null, { count: b.ids.length });
  const { results } = await db.prepare(`SELECT * FROM batches ${BATCH_ORDER}`).all();
  return c.json(results.map(batchOut));
});

/** Remove a batch from the form. Existing registrations keep their batch text. */
admin.delete("/batches/:id", superAdmin, async (c) => {
  const id = c.req.param("id");
  const r = await c.env.DB.prepare("DELETE FROM batches WHERE id = ?").bind(id).run();
  if (r.meta.changes) await audit(c.env.DB, c.get("user").id, "batch.delete", id);
  return c.json({ ok: true });
});

// --- Staff ------------------------------------------------------------------------------
const RoleEnum = z.enum(["super_admin", "coordinator", "scanner"]);
const StaffCreateIn = z.object({
  email: z.string().trim().pipe(z.email({ error: "Enter a valid email address" })),
  password: z.string().min(8, { error: "Password must be at least 8 characters" }).max(128),
  name: z.string().trim().min(1, { error: "Enter a name" }).max(120),
  role: RoleEnum,
  branch_id: z.string().nullish(),
  can_export: z.boolean().default(false),
});
const StaffUpdateIn = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: RoleEnum.optional(),
  branch_id: z.string().nullish(),
  active: z.boolean().optional(),
  can_export: z.boolean().optional(),
  password: z.string().min(8, { error: "Password must be at least 8 characters" }).max(128).optional(),
});

async function checkCoordinatorBranch(db: D1Database, role: string, branchId: string | null | undefined) {
  if (role !== "coordinator") return;
  if (!branchId || !(await db.prepare("SELECT 1 FROM branches WHERE id = ?").bind(branchId).first())) {
    fail(400, "Coordinators must be assigned to an existing branch");
  }
}

admin.get("/staff", superAdmin, async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM users ORDER BY created_at").all();
  return c.json(results.map(userOut));
});

admin.post("/staff", superAdmin, async (c) => {
  const b = await readBody(c.req.raw, StaffCreateIn);
  const db = c.env.DB;
  await checkCoordinatorBranch(db, b.role, b.branch_id);
  const id = newId("u");
  try {
    await db
      .prepare("INSERT INTO users (id, email, name, role, branch_id, password_hash, active, can_export, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1, ?)")
      .bind(id, b.email.toLowerCase(), b.name, b.role, b.role === "coordinator" ? b.branch_id : b.branch_id || null, await hashPassword(b.password), b.can_export ? 1 : 0, nowIso())
      .run();
  } catch (e) {
    if (isUnique(e)) fail(409, "Email already registered");
    throw e;
  }
  await audit(db, c.get("user").id, "staff.create", id);
  return c.json(userOut(await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first()));
});

admin.patch("/staff/:uid", superAdmin, async (c) => {
  const me = c.get("user");
  const uid = c.req.param("uid");
  const b = await readBody(c.req.raw, StaffUpdateIn);
  const db = c.env.DB;
  const cur = await db.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first<any>();
  if (!cur) fail(404, "Not found");
  const demoting = cur.role === "super_admin" && ((b.role !== undefined && b.role !== "super_admin") || b.active === false);
  if (demoting) {
    if (uid === me.id) fail(400, "You cannot demote or deactivate your own admin account");
    const n = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND active = 1").first<{ n: number }>();
    if ((n?.n ?? 0) <= 1) fail(400, "At least one active super admin must remain");
  }
  await checkCoordinatorBranch(db, b.role ?? cur.role, b.branch_id !== undefined ? b.branch_id : cur.branch_id);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => { sets.push(`${col} = ?`); vals.push(v); };
  if (b.name !== undefined) set("name", b.name);
  if (b.role !== undefined) set("role", b.role);
  if (b.branch_id !== undefined) set("branch_id", b.branch_id || null);
  if (b.active !== undefined) set("active", b.active ? 1 : 0);
  if (b.can_export !== undefined) set("can_export", b.can_export ? 1 : 0);
  if (b.password) {
    set("password_hash", await hashPassword(b.password));
    set("must_change_password", 1); // admin-set password must be changed by the owner
  }
  if (sets.length) await db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, uid).run();
  await audit(db, me.id, "staff.update", uid);
  return c.json(userOut(await db.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first()));
});

admin.delete("/staff/:uid", superAdmin, async (c) => {
  const me = c.get("user");
  const uid = c.req.param("uid");
  const db = c.env.DB;
  const cur = await db.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first<any>();
  if (!cur) fail(404, "Not found");
  if (uid === me.id) fail(400, "You cannot delete your own account");
  // The bootstrap admin would be re-created by the next sign-in with INITIAL_ADMIN_PASSWORD, so it can only be deactivated.
  if (cur.email === (c.env.INITIAL_ADMIN_EMAIL || "").toLowerCase().trim()) fail(400, "This is the main admin account. Deactivate it instead.");
  if (cur.role === "super_admin" && cur.active) {
    const n = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND active = 1").first<{ n: number }>();
    if ((n?.n ?? 0) <= 1) fail(400, "At least one active super admin must remain");
  }
  // Approvals and check-ins keep their copied names; the activity log falls back to deleted_users.
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO deleted_users (id, email, name, role, deleted_at, deleted_by) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(uid, cur.email, cur.name, cur.role, nowIso(), me.id),
    db.prepare("DELETE FROM users WHERE id = ?").bind(uid),
  ]);
  await audit(db, me.id, "staff.delete", uid, { email: cur.email, name: cur.name, role: cur.role });
  return c.json({ deleted: true });
});

// --- Audit log ----------------------------------------------------------------------------
admin.get("/audit", superAdmin, async (c) => {
  const { results } = await c.env.DB
    .prepare(
      `SELECT l.*, COALESCE(u.name, d.name || ' (deleted)') AS actor_name, COALESCE(u.email, d.email) AS actor_email
       FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id LEFT JOIN deleted_users d ON d.id = l.actor_id
       ORDER BY l.timestamp DESC LIMIT 200`,
    )
    .all<any>();
  return c.json(results.map((r) => ({ ...r, meta: safeJson(r.meta) })));
});

function safeJson(s: string | null) {
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}

export default admin;
