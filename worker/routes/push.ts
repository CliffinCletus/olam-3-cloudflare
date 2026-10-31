// Push reminders: students' devices opt in (public), super admins send a message to an audience.
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, audit, clientIp, requireRoles } from "../lib/ctx";
import { fail, newId, nowIso, phoneKey, rateLimit, readBody } from "../lib/util";
import { isPushEndpoint, sendPush } from "../lib/webpush";

const push = new Hono<AppEnv>();
const superAdmin = requireRoles("super_admin");

push.get("/push/public-key", (c) => {
  if (!c.env.VAPID_PUBLIC_KEY) fail(503, "Notifications are not available right now.");
  return c.json({ key: c.env.VAPID_PUBLIC_KEY });
});

const b64key = (label: string) => z.string({ error: `Missing ${label}` }).regex(/^[A-Za-z0-9_-]+=*$/, { error: `Invalid ${label}` }).max(200);
const SubscribeIn = z.object({
  subscription: z.object({
    endpoint: z.string().max(1000).refine(isPushEndpoint, { error: "Unsupported push service" }),
    keys: z.object({ p256dh: b64key("p256dh"), auth: b64key("auth") }),
  }),
  email: z.string().trim().max(200).optional(),
  mobile: z.string().trim().max(20).optional(),
});

/** Saves (or refreshes) a device subscription; links it to the student when email + mobile match a registration. */
push.post("/push/subscribe", async (c) => {
  const db = c.env.DB;
  await rateLimit(db, "push-sub-ip", clientIp(c), 20, 60);
  const body = await readBody(c.req.raw, SubscribeIn);
  let regId: string | null = null;
  if (body.email && body.mobile) {
    const r = await db.prepare("SELECT id, mobile_key FROM registrations WHERE email = ?").bind(body.email.toLowerCase()).first<any>();
    if (r && r.mobile_key === phoneKey(body.mobile)) regId = r.id;
  }
  const now = nowIso();
  const { endpoint, keys } = body.subscription;
  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, registration_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth,
         registration_id = COALESCE(excluded.registration_id, push_subscriptions.registration_id), updated_at = excluded.updated_at`,
    )
    .bind(newId("psh"), endpoint, keys.p256dh, keys.auth, regId, now, now)
    .run();
  return c.json({ ok: true, linked: !!regId });
});

push.post("/push/unsubscribe", async (c) => {
  const body = await readBody(c.req.raw, z.object({ endpoint: z.string().max(1000) }));
  await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(body.endpoint).run();
  return c.json({ ok: true });
});

// --- Admin: audience counts and sending --------------------------------------------------------
const AUDIENCES = {
  all: "1 = 1",
  registered: "r.id IS NOT NULL",
  pending: "r.status = 'pending'",
  approved: "r.status = 'approved'",
  not_arrived: "r.status = 'approved' AND a.id IS NULL",
} as const;
type Audience = keyof typeof AUDIENCES;

const SUB_FROM = `FROM push_subscriptions s
  LEFT JOIN registrations r ON r.id = s.registration_id
  LEFT JOIN attendance a ON a.registration_id = r.id`;

function audienceWhere(audience: Audience, branchId?: string | null) {
  const where: string[] = [AUDIENCES[audience]];
  const params: unknown[] = [];
  if (branchId) { where.push("r.branch_id = ?"); params.push(branchId); }
  return { sql: where.join(" AND "), params };
}

push.get("/push/stats", superAdmin, async (c) => {
  const branchId = c.req.query("branch_id") || null;
  const counts: Record<string, number> = {};
  for (const k of Object.keys(AUDIENCES) as Audience[]) {
    const w = audienceWhere(k, branchId);
    const row = await c.env.DB.prepare(`SELECT COUNT(*) AS n ${SUB_FROM} WHERE ${w.sql}`).bind(...w.params).first<{ n: number }>();
    counts[k] = row?.n ?? 0;
  }
  return c.json(counts);
});

const SendIn = z.object({
  title: z.string().trim().min(2, { error: "Add a title" }).max(80, { error: "Title is too long (80 characters max)" }),
  body: z.string().trim().min(2, { error: "Add a message" }).max(300, { error: "Message is too long (300 characters max)" }),
  audience: z.enum(Object.keys(AUDIENCES) as [Audience, ...Audience[]], { error: "Choose who gets the reminder" }),
  branch_id: z.string().max(40).nullish(),
  after: z.string().max(40).nullish(),
});

/** Free-plan Workers allow 50 outbound requests per call: the dashboard calls this repeatedly with `after` until `next` is null. */
const CHUNK = 40;

push.post("/push/send", superAdmin, async (c) => {
  const user = c.get("user");
  const b = await readBody(c.req.raw, SendIn);
  const db = c.env.DB;
  const w = audienceWhere(b.audience, b.branch_id);
  const { results } = await db
    .prepare(`SELECT s.id, s.endpoint, s.p256dh, s.auth ${SUB_FROM} WHERE ${w.sql} AND s.id > ? ORDER BY s.id LIMIT ?`)
    .bind(...w.params, b.after || "", CHUNK)
    .all<any>();
  const message = { title: b.title, body: b.body, url: "/", tag: "olam-reminder" };
  let sent = 0, failed = 0;
  const gone: string[] = [];
  await Promise.all(results.map(async (s) => {
    try {
      const status = await sendPush(c.env, s, message);
      if (status >= 200 && status < 300) sent++;
      else if (status === 404 || status === 410) gone.push(s.id);
      else { failed++; console.warn("push failed", status, new URL(s.endpoint).host); }
    } catch (e) { failed++; console.warn("push error", e); }
  }));
  if (gone.length) {
    await db.prepare(`DELETE FROM push_subscriptions WHERE id IN (${gone.map(() => "?").join(", ")})`).bind(...gone).run();
  }
  const next = results.length === CHUNK ? results[results.length - 1].id : null;
  if (!b.after) await audit(db, user.id, "push.send", null, { audience: b.audience, branch_id: b.branch_id ?? null, title: b.title });
  return c.json({ sent, failed, removed: gone.length, next });
});

export default push;
