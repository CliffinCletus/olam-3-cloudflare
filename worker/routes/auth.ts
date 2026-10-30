// Staff sign-in, profile and password change.
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, audit, authed, clientIp, makeToken, userOut } from "../lib/ctx";
import { addHit, countHits, fail, hashPassword, newId, nowIso, passwordStrong, rateLimit, readBody, verifyPassword } from "../lib/util";

const auth = new Hono<AppEnv>();

const LoginIn = z.object({
  email: z.email({ error: "Enter a valid email address" }),
  password: z.string({ error: "Enter your password" }).min(6, { error: "Password is too short" }).max(128),
  sign_in_as: z.enum(["super_admin", "coordinator", "scanner"]).nullish(),
  branch_id: z.string().nullish(),
});

const ROLE_LABEL = { super_admin: "Admin", coordinator: "Branch Coordinator", scanner: "Gate Scanner" } as const;

/** First super admin: created on first sign-in with INITIAL_ADMIN_EMAIL + INITIAL_ADMIN_PASSWORD. */
async function ensureBootstrapAdmin(c: any, email: string, password: string) {
  const adminEmail = (c.env.INITIAL_ADMIN_EMAIL || "").toLowerCase().trim();
  const adminPw = c.env.INITIAL_ADMIN_PASSWORD || "";
  if (!adminEmail || !adminPw || email !== adminEmail || password !== adminPw) return;
  const existing = await c.env.DB.prepare("SELECT id, must_change_password FROM users WHERE email = ?").bind(adminEmail).first();
  if (!existing) {
    await c.env.DB.prepare(
      "INSERT INTO users (id, email, name, role, branch_id, password_hash, active, can_export, must_change_password, created_at) VALUES (?, ?, 'Super Admin', 'super_admin', NULL, ?, 1, 1, 1, ?)",
    )
      .bind(newId("u"), adminEmail, await hashPassword(adminPw), nowIso())
      .run();
  } else if (!existing.must_change_password) {
    // Still using the bootstrap password? Force a change (only reached when the password matches it).
    const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(existing.id).first();
    if (row && (await verifyPassword(adminPw, row.password_hash))) {
      await c.env.DB.prepare("UPDATE users SET must_change_password = 1 WHERE id = ?").bind(existing.id).run();
    }
  }
}

auth.post("/login", async (c) => {
  const body = await readBody(c.req.raw, LoginIn);
  const db = c.env.DB;
  const email = body.email.toLowerCase().trim();
  const ip = clientIp(c);
  await rateLimit(db, "login-ip", ip, 20, 60);
  // Lock per (email, IP) so a stranger can't lock the real admin out from elsewhere;
  // a higher per-email ceiling still slows distributed guessing.
  const pairKey = `loginfail:${email}|${ip}`;
  const emailKey = `loginfail:${email}`;
  if ((await countHits(db, pairKey, 900)) >= 5 || (await countHits(db, emailKey, 900)) >= 30) {
    fail(429, "Too many failed sign-ins. Try again in 15 minutes.");
  }
  await ensureBootstrapAdmin(c, email, body.password);
  const row = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<any>();
  if (!row || !row.active || !(await verifyPassword(body.password, row.password_hash))) {
    await addHit(db, pairKey);
    await addHit(db, emailKey);
    await audit(db, row?.id ?? null, "login.failed", null, { email_domain: email.split("@").pop() });
    fail(401, "Invalid credentials");
  }
  await db.prepare("DELETE FROM rate_hits WHERE k IN (?, ?)").bind(pairKey, emailKey).run();
  const user = userOut(row);
  // Password already verified: role / branch hints can't leak anything to outsiders.
  if (body.sign_in_as && body.sign_in_as !== user.role) {
    const label = ROLE_LABEL[user.role];
    const an = "AEIOU".includes(label[0]) ? "an" : "a";
    fail(403, `This account is ${an} ${label} account. Please choose '${label}' to sign in.`);
  }
  if (user.role === "coordinator" && body.sign_in_as === "coordinator" && body.branch_id !== user.branch_id) {
    const own = await db.prepare("SELECT name FROM branches WHERE id = ?").bind(user.branch_id).first<{ name: string }>();
    const ownName = own?.name ?? "your branch";
    fail(403, `This coordinator account belongs to ${ownName}. Please choose ${ownName} to sign in.`);
  }
  const token = await makeToken(c.env, user);
  await audit(db, user.id, "login");
  return c.json({ access_token: token, token_type: "bearer", user });
});

auth.get("/me", authed, (c) => c.json(c.get("user")));

const ChangePasswordIn = z.object({
  current_password: z.string().min(1, { error: "Enter your current password" }).max(128),
  new_password: z.string().min(10, { error: "New password must be at least 10 characters with letters and numbers" }).max(128),
});

auth.post("/change-password", authed, async (c) => {
  const user = c.get("user");
  const body = await readBody(c.req.raw, ChangePasswordIn);
  const db = c.env.DB;
  await rateLimit(db, "chpw", user.id, 10, 300);
  const full = await db.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first<{ password_hash: string }>();
  if (!full || !(await verifyPassword(body.current_password, full.password_hash))) fail(400, "Current password is incorrect");
  if (!passwordStrong(body.new_password)) fail(400, "New password must be at least 10 characters with letters and numbers");
  if (body.new_password === body.current_password || body.new_password === c.env.INITIAL_ADMIN_PASSWORD) {
    fail(400, "Choose a new password you have not used here before");
  }
  await db
    .prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?")
    .bind(await hashPassword(body.new_password), user.id)
    .run();
  await audit(db, user.id, "password.change", user.id);
  return c.json({ ok: true });
});

export default auth;
