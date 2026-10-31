// End-to-end API tests. Run against `wrangler dev` (local D1):
//   npm run dev            (terminal 1)
//   npm run test:api       (terminal 2)   BASE=http://127.0.0.1:8787 ADMIN_EMAIL=... ADMIN_PW=... to override
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE || "http://127.0.0.1:8787";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "cliffincliffin@gmail.com";
const BOOT_PW = process.env.ADMIN_BOOT_PW || "Bootstrap123";
const ADMIN_PW = process.env.ADMIN_PW || "AdminPass12345";
const RUN = Math.random().toString(36).slice(2, 8);
let ipN = 1;
const freshIp = () => `10.${(Date.now() / 1000) & 255}.${(ipN = (ipN % 250) + 1)}.${Math.floor(Math.random() * 250)}`;

async function call(path, { method = "GET", body, token, ip } = {}) {
  const headers = { "cf-connecting-ip": ip || freshIp() };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, headers: r.headers };
}

const phone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;
const regBody = (over = {}) => ({
  full_name: `Test Student ${RUN}`,
  mobile: phone(),
  email: `student.${RUN}.${Math.random().toString(36).slice(2, 7)}@example.com`,
  branch_id: "br-1",
  batch: "A1",
  batch_no: "12",
  faculty_name: "Anu Teacher",
  confirm: true,
  privacy_accepted: true,
  ...over,
});

let admin; // token
async function adminToken() {
  if (admin) return admin;
  let r = await call("/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: ADMIN_PW, sign_in_as: "super_admin" } });
  if (r.status !== 200) {
    // First run: bootstrap admin, then the forced password change.
    r = await call("/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: BOOT_PW, sign_in_as: "super_admin" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.user.must_change_password, true);
    const blocked = await call("/stats", { token: r.data.access_token });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.data.detail, "Password change required");
    const ch = await call("/auth/change-password", { method: "POST", token: r.data.access_token, body: { current_password: BOOT_PW, new_password: ADMIN_PW } });
    assert.equal(ch.status, 200, JSON.stringify(ch.data));
    r = await call("/auth/login", { method: "POST", body: { email: ADMIN_EMAIL, password: ADMIN_PW } });
  }
  assert.equal(r.status, 200);
  admin = r.data.access_token;
  return admin;
}

async function makeStaff(role, extra = {}) {
  const t = await adminToken();
  const email = `${role}.${RUN}.${Math.random().toString(36).slice(2, 6)}@olam.test`;
  const r = await call("/staff", { method: "POST", token: t, body: { email, name: `${role} ${RUN}`, password: "TempPass99", role, ...extra } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  let l = await call("/auth/login", { method: "POST", body: { email, password: "TempPass99" } });
  assert.equal(l.status, 200);
  await call("/auth/change-password", { method: "POST", token: l.data.access_token, body: { current_password: "TempPass99", new_password: "StaffPass123" } });
  l = await call("/auth/login", { method: "POST", body: { email, password: "StaffPass123" } });
  return { token: l.data.access_token, user: l.data.user, email };
}

test("health + public endpoints", async () => {
  assert.equal((await call("/health")).data.status, "ok");
  const b = await call("/public/branches");
  assert.ok(b.data.length >= 3);
  const bt = await call("/public/batches");
  assert.ok(bt.data.some((x) => x.name === "A1"));
  const s = await call("/public/settings");
  assert.equal(typeof s.data.registration_open, "boolean");
  assert.ok(s.data.privacy_notice.length > 20);
});

test("unknown api path is JSON 404", async () => {
  const r = await call("/nope");
  assert.equal(r.status, 404);
  assert.equal(r.data.detail, "Not found");
});

test("registration validation and unique email + phone", async () => {
  await adminToken();
  const bad = await call("/registrations", { method: "POST", body: regBody({ confirm: false }) });
  assert.equal(bad.status, 422);
  assert.match(bad.data.detail, /confirm/i);
  const noPrivacy = await call("/registrations", { method: "POST", body: regBody({ privacy_accepted: false }) });
  assert.equal(noPrivacy.status, 422);
  const shortPhone = await call("/registrations", { method: "POST", body: regBody({ mobile: "12345" }) });
  assert.equal(shortPhone.status, 422);
  const badBranch = await call("/registrations", { method: "POST", body: regBody({ branch_id: "br-nope" }) });
  assert.equal(badBranch.status, 400);

  const body = regBody();
  const ok = await call("/registrations", { method: "POST", body });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.match(ok.data.reference, /^OLM-[0-9A-F]{6}$/);
  assert.equal(ok.data.status, "pending");
  assert.equal(ok.data.branch_name, "KALOOR");

  const sameEmail = await call("/registrations", { method: "POST", body: regBody({ email: body.email.toUpperCase() }) });
  assert.equal(sameEmail.status, 409);
  assert.match(sameEmail.data.detail, /email/i);
  const samePhone = await call("/registrations", { method: "POST", body: regBody({ mobile: `+91 ${body.mobile.slice(0, 5)} ${body.mobile.slice(5)}` }) });
  assert.equal(samePhone.status, 409);
  assert.match(samePhone.data.detail, /mobile/i);
});

test("full flow: lookup, approve, pass verify, scan, duplicate, reject revokes", async () => {
  const t = await adminToken();
  const body = regBody();
  const reg = (await call("/registrations", { method: "POST", body })).data;

  const wrongEmail = await call("/registrations/lookup", { method: "POST", body: { mobile: body.mobile, email: "other@example.com" } });
  assert.equal(wrongEmail.status, 404);
  const wrongMobile = await call("/registrations/lookup", { method: "POST", body: { mobile: "9000000001", email: body.email } });
  assert.equal(wrongMobile.status, 404);
  const noMobile = await call("/registrations/lookup", { method: "POST", body: { email: body.email } });
  assert.equal(noMobile.status, 422);
  // Mobile in any format (+91, spaces) and email in any case
  const pending = await call("/registrations/lookup", { method: "POST", body: { mobile: `+91 ${body.mobile.slice(0, 5)} ${body.mobile.slice(5)}`, email: body.email.toUpperCase() } });
  assert.equal(pending.status, 200);
  assert.equal(pending.data.registration.status, "pending");
  assert.equal(pending.data.pass_token, null);

  const ap = await call(`/registrations/${reg.id}/approve`, { method: "POST", token: t });
  assert.equal(ap.status, 200);
  assert.equal(ap.data.status, "approved");

  const lk = await call("/registrations/lookup", { method: "POST", body: { mobile: body.mobile, email: body.email } });
  const token = lk.data.pass_token;
  assert.ok(token && token.length >= 20);
  assert.ok("event" in lk.data);

  const v = await call("/pass/verify", { method: "POST", body: { token } });
  assert.equal(v.status, 200);
  assert.equal(v.data.registration.reference, reg.reference);

  // approve is idempotent: same token
  await call(`/registrations/${reg.id}/approve`, { method: "POST", token: t });
  const lk2 = await call("/registrations/lookup", { method: "POST", body: { reference: reg.reference.toLowerCase(), email: body.email } });
  assert.equal(lk2.data.pass_token, token);

  const s1 = await call("/scan", { method: "POST", token: t, body: { token, station: "gate-1" } });
  assert.equal(s1.data.result, "VALID");
  assert.equal(s1.data.registration.full_name, body.full_name);
  const s2 = await call("/scan", { method: "POST", token: t, body: { token } });
  assert.equal(s2.data.result, "ALREADY_CHECKED_IN");
  assert.ok(s2.data.checked_in_at);
  const s3 = await call("/scan", { method: "POST", token: t, body: { token: reg.reference } });
  assert.equal(s3.data.result, "ALREADY_CHECKED_IN");
  const bad = await call("/scan", { method: "POST", token: t, body: { token: "garbage-token-123" } });
  assert.equal(bad.data.result, "INVALID");

  const att = await call("/attendance", { token: t });
  assert.ok(att.data.checkins.some((c) => c.reference === reg.reference));
  assert.ok(att.data.duplicate_count >= 2);
  const hist = await call("/scan/history", { token: t });
  assert.ok(hist.data.some((h) => h.reference === reg.reference));

  const rj = await call(`/registrations/${reg.id}/reject`, { method: "POST", token: t, body: { reason: "Testing revoke" } });
  assert.equal(rj.data.status, "rejected");
  const s4 = await call("/scan", { method: "POST", token: t, body: { token } });
  assert.equal(s4.data.result, "REVOKED");
  assert.equal((await call("/pass/verify", { method: "POST", body: { token } })).status, 404);

  // Re-approve issues a NEW token; the old QR stays dead.
  await call(`/registrations/${reg.id}/approve`, { method: "POST", token: t });
  const lk3 = await call("/registrations/lookup", { method: "POST", body: { mobile: body.mobile, email: body.email } });
  assert.notEqual(lk3.data.pass_token, token);
  assert.equal((await call("/scan", { method: "POST", token: t, body: { token } })).data.result, "INVALID");
});

test("scan of pending registration by reference is NOT_APPROVED", async () => {
  const t = await adminToken();
  const reg = (await call("/registrations", { method: "POST", body: regBody() })).data;
  const r = await call("/scan", { method: "POST", token: t, body: { token: reg.reference } });
  assert.equal(r.data.result, "NOT_APPROVED");
});

test("coordinator is scoped to own branch; bulk approve; CSV permission", async () => {
  const t = await adminToken();
  const coord = await makeStaff("coordinator", { branch_id: "br-2" });
  const mine = [
    (await call("/registrations", { method: "POST", body: regBody({ branch_id: "br-2" }) })).data,
    (await call("/registrations", { method: "POST", body: regBody({ branch_id: "br-2" }) })).data,
  ];
  const other = (await call("/registrations", { method: "POST", body: regBody({ branch_id: "br-3" }) })).data;

  const list = await call("/registrations?status_=pending", { token: coord.token });
  assert.ok(list.data.every((r) => r.branch_id === "br-2"));
  assert.ok(list.data.some((r) => r.id === mine[0].id));
  assert.equal((await call(`/registrations/${other.id}/approve`, { method: "POST", token: coord.token })).status, 403);

  const bulk = await call("/registrations/bulk-approve", { method: "POST", token: coord.token, body: { ids: [mine[0].id, mine[1].id, other.id, "reg-missing"] } });
  assert.equal(bulk.data.approved, 2);
  assert.deepEqual(bulk.data.skipped.map((s) => s.reason).sort(), ["not found", "not your branch"]);

  const stats = await call("/stats", { token: coord.token });
  assert.ok(stats.data.approved >= 2);
  assert.deepEqual(stats.data.by_branch, []);

  assert.equal((await call("/export/registrations.csv", { token: coord.token })).status, 403);
  await call(`/staff/${coord.user.id}`, { method: "PATCH", token: t, body: { can_export: true } });
  const csv = await fetch(`${BASE}/api/export/registrations.csv`, { headers: { authorization: `Bearer ${coord.token}` } });
  assert.equal(csv.status, 200);
  const txt = await csv.text();
  assert.match(txt, /"Reference","Name"/);
  assert.ok(!txt.includes("KALOOR")); // own branch only

  // Wrong branch / wrong role hints at sign-in
  const wrongBranch = await call("/auth/login", { method: "POST", body: { email: coord.email, password: "StaffPass123", sign_in_as: "coordinator", branch_id: "br-1" } });
  assert.equal(wrongBranch.status, 403);
  assert.match(wrongBranch.data.detail, /ELAMAKKARA/);
  const wrongRole = await call("/auth/login", { method: "POST", body: { email: coord.email, password: "StaffPass123", sign_in_as: "scanner" } });
  assert.equal(wrongRole.status, 403);
  assert.match(wrongRole.data.detail, /Branch Coordinator/);
});

test("scanner role: can scan, cannot review", async () => {
  const sc = await makeStaff("scanner");
  assert.equal((await call("/registrations", { token: sc.token })).status, 403);
  assert.equal((await call("/scan/history", { token: sc.token })).status, 200);
  assert.equal((await call("/scan", { method: "POST", token: sc.token, body: { token: "OLM-ZZZZZZ" } })).data.result, "INVALID");
});

test("batches: super admin can add, rename (cascades), reorder, delete", async () => {
  const t = await adminToken();
  const name = `Batch ${RUN}`;
  const add = await call("/batches", { method: "POST", token: t, body: { name } });
  assert.equal(add.status, 200);
  assert.equal((await call("/batches", { method: "POST", token: t, body: { name: name.toLowerCase() } })).status, 409);

  const reg = (await call("/registrations", { method: "POST", body: regBody({ batch: name }) })).data;
  const renamed = await call(`/batches/${add.data.id}`, { method: "PATCH", token: t, body: { name: `${name} Renamed` } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.name, `${name} Renamed`);
  const after = await call(`/registrations/${reg.id}`, { token: t });
  assert.equal(after.data.batch, `${name} Renamed`);
  assert.equal((await call("/batches/bt-a1", { method: "PATCH", token: t, body: { name: "A2" } })).status, 409);
  assert.equal((await call("/batches/bt-nope", { method: "PATCH", token: t, body: { name: "X" } })).status, 404);
  assert.equal((await call(`/batches/${add.data.id}`, { method: "PATCH", token: t, body: { name: "  " } })).status, 422);

  const list = (await call("/batches", { token: t })).data;
  const withCount = list.find((b) => b.id === add.data.id);
  assert.equal(withCount.registrations, 1);
  const ids = list.map((b) => b.id);
  const reordered = await call("/batches/order", { method: "PUT", token: t, body: { ids: [add.data.id, ...ids.filter((i) => i !== add.data.id)] } });
  assert.equal(reordered.data[0].id, add.data.id);
  const pub = (await call("/public/batches")).data;
  assert.equal(pub[0].id, add.data.id);
  // restore order so the new batch isn't first forever
  await call("/batches/order", { method: "PUT", token: t, body: { ids: [...ids.filter((i) => i !== add.data.id), add.data.id] } });

  const coord = await makeStaff("coordinator", { branch_id: "br-1" });
  assert.equal((await call(`/batches/${add.data.id}`, { method: "PATCH", token: coord.token, body: { name: "Nope" } })).status, 403);
  assert.equal((await call(`/batches/${add.data.id}`, { method: "DELETE", token: coord.token })).status, 403);

  assert.equal((await call(`/batches/${add.data.id}`, { method: "DELETE", token: t })).status, 200);
  assert.ok(!(await call("/public/batches")).data.some((b) => b.id === add.data.id));
  assert.equal((await call(`/registrations/${reg.id}`, { token: t })).data.batch, `${name} Renamed`); // registration keeps text
});

test("branches: create, rename, switch off hides from form", async () => {
  const t = await adminToken();
  const b = await call("/branches", { method: "POST", token: t, body: { name: `BR ${RUN}`, active: true } });
  assert.equal(b.status, 200);
  assert.equal((await call("/branches", { method: "POST", token: t, body: { name: `br ${RUN}` } })).status, 409);
  const off = await call(`/branches/${b.data.id}`, { method: "PATCH", token: t, body: { name: `BR ${RUN} X`, active: false } });
  assert.equal(off.data.active, false);
  assert.ok(!(await call("/public/branches")).data.some((x) => x.id === b.data.id));
  assert.equal((await call("/registrations", { method: "POST", body: regBody({ branch_id: b.data.id }) })).status, 400);
});

test("settings: close registration blocks new ones; validation", async () => {
  const t = await adminToken();
  const cur = (await call("/settings", { token: t })).data;
  const bad = await call("/settings", { method: "PUT", token: t, body: { ...cur, event_date: "2026-13-45" } });
  assert.equal(bad.status, 422);
  const closed = await call("/settings", { method: "PUT", token: t, body: { ...cur, registration_open: false, closed_message: "Closed for testing", event_date: "2026-12-20", event_time_venue: "9:30 AM · Kaloor" } });
  assert.equal(closed.data.registration_open, false);
  assert.equal(closed.data.event_date, "2026-12-20");
  const r = await call("/registrations", { method: "POST", body: regBody() });
  assert.equal(r.status, 403);
  assert.equal(r.data.detail, "Closed for testing");
  await call("/settings", { method: "PUT", token: t, body: { ...cur, registration_open: true, closed_message: cur.closed_message, event_date: "2026-12-20", event_time_venue: "9:30 AM · Kaloor" } });
  assert.equal((await call("/public/settings")).data.registration_open, true);
});

test("reports: faculty, event-day, absent and CSV exports", async () => {
  const t = await adminToken();
  const body = regBody({ faculty_name: `  Dr   Report ${RUN} ` });
  const reg = (await call("/registrations", { method: "POST", body })).data;
  await call(`/registrations/${reg.id}/approve`, { method: "POST", token: t });

  const fac = await call("/reports/faculty", { token: t });
  const row = fac.data.rows.find((r) => r.faculty_name === `Dr Report ${RUN}`);
  assert.ok(row, "faculty name is whitespace-normalised");
  assert.equal(row.approved, 1);

  const ab = await call("/reports/absent?branch_id=br-1", { token: t });
  assert.ok(ab.data.branches.flatMap((g) => g.students).some((s) => s.reference === reg.reference));

  const ed = await call("/reports/event-day", { token: t });
  assert.ok(ed.data.totals.registered >= 1);
  assert.ok(ed.data.by_branch.some((b) => b.branch_name === "MUVATTUPUZHA"));
  assert.ok(Array.isArray(ed.data.by_branch_batch));

  for (const p of ["/export/faculty.csv", "/export/event-day.csv", "/export/absent.csv", "/export/registrations.csv"]) {
    const r = await fetch(`${BASE}/api${p}`, { headers: { authorization: `Bearer ${t}` } });
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get("content-type"), /text\/csv/);
  }
});

test("CSV exports follow the list filters; attendance CSV", async () => {
  const t = await adminToken();
  const tag = `Filter ${RUN} ${Math.random().toString(36).slice(2, 6)}`;
  const a = (await call("/registrations", { method: "POST", body: regBody({ faculty_name: tag, branch_id: "br-2" }) })).data;
  const p = (await call("/registrations", { method: "POST", body: regBody({ faculty_name: tag, branch_id: "br-2" }) })).data;
  const other = (await call("/registrations", { method: "POST", body: regBody({ faculty_name: tag, branch_id: "br-3" }) })).data;
  await call(`/registrations/${a.id}/approve`, { method: "POST", token: t });
  const get = async (path, token = t) => {
    const r = await fetch(`${BASE}/api${path}`, { headers: { authorization: `Bearer ${token}` } });
    return { status: r.status, text: await r.text() };
  };

  const q = encodeURIComponent(tag);
  const approved = await get(`/export/registrations.csv?status=approved&q=${q}`);
  assert.equal(approved.status, 200);
  assert.ok(approved.text.includes(a.reference) && !approved.text.includes(p.reference));
  const branch = await get(`/export/registrations.csv?branch_id=br-2&q=${q}`);
  assert.ok(branch.text.includes(a.reference) && branch.text.includes(p.reference) && !branch.text.includes(other.reference));
  const list = await call(`/registrations?status=pending&branch_id=br-2&q=${q}`, { token: t });
  assert.deepEqual(list.data.map((r) => r.id), [p.id]);
  assert.equal((await get("/export/registrations.csv?status=bogus")).status, 422);

  const token = (await call("/registrations/lookup", { method: "POST", body: { reference: a.reference, email: a.email } })).data.pass_token;
  await call("/scan", { method: "POST", token: t, body: { token, station: "gate-csv" } });
  await call("/scan", { method: "POST", token: t, body: { token, station: "gate-csv" } });
  const ins = await get("/export/attendance.csv?branch_id=br-2");
  assert.equal(ins.status, 200);
  assert.match(ins.text, /"Checked In At","Reference","Name"/);
  assert.ok(ins.text.includes(a.reference));
  const refused = await get("/export/attendance.csv?view=attempts&branch_id=br-2");
  assert.match(refused.text, /"Attempted At","Result"/);
  assert.ok(refused.text.includes(`"Duplicate","${a.reference}"`));
  const elsewhere = await get("/export/attendance.csv?branch_id=br-3");
  assert.ok(!elsewhere.text.includes(a.reference));

  const coord = await makeStaff("coordinator", { branch_id: "br-3" });
  assert.equal((await get("/export/attendance.csv", coord.token)).status, 403);
  await call(`/staff/${coord.user.id}`, { method: "PATCH", token: t, body: { can_export: true } });
  const own = await get("/export/attendance.csv?branch_id=br-2", coord.token); // branch_id is ignored for coordinators
  assert.equal(own.status, 200);
  assert.ok(!own.text.includes(a.reference));
});

test("super admin can delete registrations (single + bulk); others cannot", async () => {
  const t = await adminToken();
  const body = regBody();
  const one = (await call("/registrations", { method: "POST", body })).data;
  await call(`/registrations/${one.id}/approve`, { method: "POST", token: t });
  const token = (await call("/registrations/lookup", { method: "POST", body: { mobile: body.mobile, email: body.email } })).data.pass_token;
  await call("/scan", { method: "POST", token: t, body: { token } });
  await call("/scan", { method: "POST", token: t, body: { token } }); // duplicate -> refused-scan row

  const coord = await makeStaff("coordinator", { branch_id: "br-1" });
  assert.equal((await call(`/registrations/${one.id}`, { method: "DELETE", token: coord.token })).status, 403);
  assert.equal((await call("/registrations/bulk-delete", { method: "POST", token: coord.token, body: { ids: [one.id] } })).status, 403);

  const d = await call(`/registrations/${one.id}`, { method: "DELETE", token: t });
  assert.equal(d.status, 200, JSON.stringify(d.data));
  assert.equal((await call(`/registrations/${one.id}`, { token: t })).status, 404);
  assert.equal((await call(`/registrations/${one.id}`, { method: "DELETE", token: t })).status, 404);
  assert.equal((await call("/pass/verify", { method: "POST", body: { token } })).status, 404);
  assert.equal((await call("/scan", { method: "POST", token: t, body: { token } })).data.result, "INVALID");
  const att = await call("/attendance", { token: t });
  assert.ok(!att.data.checkins.some((c) => c.reference === one.reference));
  assert.ok(!att.data.attempts.some((c) => c.reference === one.reference));
  // The same email + mobile can register again
  assert.equal((await call("/registrations", { method: "POST", body })).status, 200);

  const two = [(await call("/registrations", { method: "POST", body: regBody() })).data, (await call("/registrations", { method: "POST", body: regBody() })).data];
  const bulk = await call("/registrations/bulk-delete", { method: "POST", token: t, body: { ids: [...two.map((r) => r.id), "reg-missing"] } });
  assert.equal(bulk.data.deleted, 2);
  for (const r of two) assert.equal((await call(`/registrations/${r.id}`, { token: t })).status, 404);
  assert.equal((await call("/registrations/bulk-delete", { method: "POST", token: t, body: { ids: [] } })).status, 422);
});

test("push reminders: subscribe validation, linking, audience counts, send", async () => {
  const t = await adminToken();
  const key = await call("/push/public-key");
  assert.equal(key.status, 200, "VAPID keys must be in .dev.vars (npm run vapid -- --print)");
  const b64 = (n) => Buffer.from(Array.from({ length: n }, () => Math.floor(Math.random() * 256))).toString("base64url");
  const sub = (endpoint) => ({ endpoint, keys: { p256dh: b64(65), auth: b64(16) } });

  assert.equal((await call("/push/subscribe", { method: "POST", body: { subscription: sub("https://evil.example.com/push/1") } })).status, 422);
  assert.equal((await call("/push/subscribe", { method: "POST", body: { subscription: sub("http://fcm.googleapis.com/fcm/send/x") } })).status, 422);

  const body = regBody({ branch_id: "br-3" });
  const reg = (await call("/registrations", { method: "POST", body })).data;
  const endpoint = `https://fcm.googleapis.com/fcm/send/test-${RUN}-${Math.random().toString(36).slice(2)}`;
  assert.equal((await call("/push/subscribe", { method: "POST", body: { subscription: sub(endpoint) } })).data.linked, false);
  assert.equal((await call("/push/subscribe", { method: "POST", body: { subscription: sub(endpoint), email: body.email, mobile: "9000000002" } })).data.linked, false);
  assert.equal((await call("/push/subscribe", { method: "POST", body: { subscription: sub(endpoint), email: body.email, mobile: body.mobile } })).data.linked, true);

  const before = (await call("/push/stats?branch_id=br-3", { token: t })).data;
  assert.ok(before.pending >= 1 && before.registered >= before.pending);
  const coord = await makeStaff("coordinator", { branch_id: "br-3" });
  assert.equal((await call("/push/stats", { token: coord.token })).status, 403);
  assert.equal((await call("/push/send", { method: "POST", token: coord.token, body: { title: "Hi", body: "There", audience: "all" } })).status, 403);
  assert.equal((await call("/push/send", { method: "POST", token: t, body: { title: "", body: "x", audience: "all" } })).status, 422);
  // A branch with no devices: nothing is sent, no paging
  const none = await call("/push/send", { method: "POST", token: t, body: { title: "Hello", body: "Nobody here", audience: "approved", branch_id: "br-none" } });
  assert.deepEqual(none.data, { sent: 0, failed: 0, removed: 0, next: null });

  // Deleting the registration removes its devices too
  await call(`/registrations/${reg.id}`, { method: "DELETE", token: t });
  const after = (await call("/push/stats?branch_id=br-3", { token: t })).data;
  assert.equal(after.pending, before.pending - 1);
  assert.equal((await call("/push/unsubscribe", { method: "POST", body: { endpoint } })).status, 200);
});

test("CSV injection is neutralised", async () => {
  const t = await adminToken();
  await call("/registrations", { method: "POST", body: regBody({ full_name: "=HYPERLINK(\"x\")", faculty_name: "+Evil Faculty" }) });
  const txt = await (await fetch(`${BASE}/api/export/registrations.csv`, { headers: { authorization: `Bearer ${t}` } })).text();
  assert.ok(txt.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(!/,"=HYPERLINK/.test(txt));
});

test("staff management guards", async () => {
  const t = await adminToken();
  const me = (await call("/auth/me", { token: t })).data;
  const self = await call(`/staff/${me.id}`, { method: "PATCH", token: t, body: { role: "scanner" } });
  assert.equal(self.status, 400);
  const noBranch = await call("/staff", { method: "POST", token: t, body: { email: `nb.${RUN}@olam.test`, name: "NB", password: "TempPass99", role: "coordinator" } });
  assert.equal(noBranch.status, 400);
  const sc = await makeStaff("scanner");
  const dup = await call("/staff", { method: "POST", token: t, body: { email: sc.email, name: "Dup", password: "TempPass99", role: "scanner" } });
  assert.equal(dup.status, 409);
  // Deactivate -> token stops working
  await call(`/staff/${sc.user.id}`, { method: "PATCH", token: t, body: { active: false } });
  assert.equal((await call("/scan/history", { token: sc.token })).status, 401);
  // Admin password reset forces a change
  await call(`/staff/${sc.user.id}`, { method: "PATCH", token: t, body: { active: true, password: "ResetPass77" } });
  const l = await call("/auth/login", { method: "POST", body: { email: sc.email, password: "ResetPass77" } });
  assert.equal(l.data.user.must_change_password, true);
  const audit = await call("/audit", { token: t });
  assert.ok(audit.data.some((a) => a.action === "staff.update"));
});

test("auth: bad tokens, wrong password lockout", async () => {
  assert.equal((await call("/stats")).status, 401);
  assert.equal((await call("/stats", { token: "abc.def.ghi" })).status, 401);
  const ip = "10.250.250.250";
  const email = `lock.${RUN}@olam.test`;
  for (let i = 0; i < 5; i++) {
    const r = await call("/auth/login", { method: "POST", ip, body: { email, password: "wrongpass" } });
    assert.equal(r.status, 401);
  }
  const locked = await call("/auth/login", { method: "POST", ip, body: { email, password: "wrongpass" } });
  assert.equal(locked.status, 429);
});

test("weak new password rejected", async () => {
  const sc = await makeStaff("scanner");
  const r = await call("/auth/change-password", { method: "POST", token: sc.token, body: { current_password: "StaffPass123", new_password: "onlyletters" } });
  assert.equal(r.status, 400);
});
