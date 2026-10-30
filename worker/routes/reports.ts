// Dashboard stats, faculty / event-day / absent reports and CSV exports.
import { Hono } from "hono";
import { type AppEnv, type User, audit, canExport, coordinatorBranch, requireRoles } from "../lib/ctx";
import { csvResponse, toCsv } from "../lib/util";

const reports = new Hono<AppEnv>();
const reviewer = requireRoles("super_admin", "coordinator");

/** Branch scope: coordinators -> own branch; super admins -> optional ?branch_id. */
function scope(user: User, requested?: string): string | null {
  return coordinatorBranch(user) ?? (requested || null);
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

reports.get("/stats", reviewer, async (c) => {
  const user = c.get("user");
  const db = c.env.DB;
  const own = coordinatorBranch(user);
  const where = own ? "WHERE r.branch_id = ?" : "";
  const args = own ? [own] : [];
  const counts = await db
    .prepare(
      `SELECT COUNT(*) AS total,
         SUM(r.status = 'pending') AS pending, SUM(r.status = 'approved') AS approved, SUM(r.status = 'rejected') AS rejected,
         SUM(a.id IS NOT NULL) AS checked_in
       FROM registrations r LEFT JOIN attendance a ON a.registration_id = r.id ${where}`,
    )
    .bind(...args)
    .first<any>();
  let by_branch: any[] = [];
  if (user.role === "super_admin") {
    const { results } = await db
      .prepare(
        `SELECT b.name AS branch, COUNT(r.id) AS total, COALESCE(SUM(r.status = 'approved'), 0) AS approved, COUNT(a.id) AS checked_in
         FROM branches b LEFT JOIN registrations r ON r.branch_id = b.id LEFT JOIN attendance a ON a.registration_id = r.id
         GROUP BY b.id ORDER BY b.created_at, b.name`,
      )
      .all();
    by_branch = results;
  }
  const approved = counts?.approved ?? 0;
  const checked = counts?.checked_in ?? 0;
  return c.json({
    total: counts?.total ?? 0,
    pending: counts?.pending ?? 0,
    approved,
    rejected: counts?.rejected ?? 0,
    checked_in: checked,
    not_checked_in: Math.max(approved - checked, 0),
    attendance_pct: pct(checked, approved),
    by_branch,
  });
});

// --- Faculty report ---------------------------------------------------------------------
async function facultyRows(db: D1Database, branchId: string | null) {
  const { results } = await db
    .prepare(
      `SELECT r.id, r.branch_id, r.faculty_name, r.status, b.name AS branch_name, a.id AS att
       FROM registrations r LEFT JOIN branches b ON b.id = r.branch_id LEFT JOIN attendance a ON a.registration_id = r.id
       WHERE r.faculty_name IS NOT NULL ${branchId ? "AND r.branch_id = ?" : ""}`,
    )
    .bind(...(branchId ? [branchId] : []))
    .all<any>();
  const groups = new Map<string, any>();
  for (const r of results) {
    const display = String(r.faculty_name || "").trim().replace(/\s+/g, " ");
    if (!display) continue;
    const key = `${r.branch_id}|${display.toLowerCase()}`;
    let g = groups.get(key);
    if (!g) {
      g = { branch_id: r.branch_id, branch_name: r.branch_name ?? "?", faculty_name: display, total: 0, approved: 0, pending: 0, rejected: 0, checked_in: 0 };
      groups.set(key, g);
    }
    g.total++;
    g[r.status] = (g[r.status] || 0) + 1;
    if (r.att) g.checked_in++;
  }
  return [...groups.values()].sort(
    (a, b) => a.branch_name.localeCompare(b.branch_name) || b.total - a.total || a.faculty_name.toLowerCase().localeCompare(b.faculty_name.toLowerCase()),
  );
}

reports.get("/reports/faculty", reviewer, async (c) => {
  const rows = await facultyRows(c.env.DB, scope(c.get("user"), c.req.query("branch_id")));
  return c.json({ rows, total_students: rows.reduce((s, r) => s + r.total, 0), faculty_count: rows.length });
});

reports.get("/export/faculty.csv", reviewer, async (c) => {
  const user = c.get("user");
  canExport(user);
  const rows = await facultyRows(c.env.DB, scope(user, c.req.query("branch_id")));
  const csv = toCsv([
    ["Branch", "Faculty Name", "Total Students", "Approved", "Pending", "Rejected", "Checked In"],
    ...rows.map((r) => [r.branch_name, r.faculty_name, r.total, r.approved, r.pending, r.rejected, r.checked_in]),
  ]);
  await audit(c.env.DB, user.id, "export.faculty_csv", null, { rows: rows.length });
  return csvResponse(csv, "olam-faculty-report.csv");
});

// --- Event day summary (attendance by branch and batch) --------------------------------------
type AttRow = { branch_name?: string; batch?: string; registered: number; approved: number; checked_in: number; absent?: number; attendance_pct?: number };
const attRow = (kw: Partial<AttRow> = {}): AttRow => ({ ...kw, registered: 0, approved: 0, checked_in: 0 });

async function eventDaySummary(db: D1Database, user: User) {
  const own = coordinatorBranch(user);
  const { results: branches } = await db.prepare("SELECT id, name FROM branches").all<any>();
  const { results: regs } = await db
    .prepare(
      `SELECT r.id, r.branch_id, r.batch, r.status, a.checked_in_at
       FROM registrations r LEFT JOIN attendance a ON a.registration_id = r.id ${own ? "WHERE r.branch_id = ?" : ""}`,
    )
    .bind(...(own ? [own] : []))
    .all<any>();
  const bname = new Map(branches.map((b) => [b.id, b.name]));
  const total = attRow();
  const byBranch = new Map<string, AttRow>();
  const byBatch = new Map<string, AttRow>();
  const byPair = new Map<string, AttRow>();
  // Show every branch in scope, even ones with no registrations yet.
  for (const b of branches) if (!own || own === b.id) byBranch.set(b.name, attRow({ branch_name: b.name }));
  let first: string | null = null;
  let last: string | null = null;
  for (const r of regs) {
    const br = bname.get(r.branch_id) ?? "?";
    const batch = r.batch || "?";
    if (!byBranch.has(br)) byBranch.set(br, attRow({ branch_name: br }));
    if (!byBatch.has(batch)) byBatch.set(batch, attRow({ batch }));
    const pk = `${br}\u0000${batch}`;
    if (!byPair.has(pk)) byPair.set(pk, attRow({ branch_name: br, batch }));
    const approved = r.status === "approved";
    const present = approved && !!r.checked_in_at;
    for (const row of [total, byBranch.get(br)!, byBatch.get(batch)!, byPair.get(pk)!]) {
      row.registered++;
      if (approved) row.approved++;
      if (present) row.checked_in++;
    }
    if (present) {
      if (!first || r.checked_in_at < first) first = r.checked_in_at;
      if (!last || r.checked_in_at > last) last = r.checked_in_at;
    }
  }
  const fin = (rows: AttRow[]) => rows.map((x) => ({ ...x, absent: Math.max(x.approved - x.checked_in, 0), attendance_pct: pct(x.checked_in, x.approved) }));
  const cmp = (a?: string, b?: string) => (a ?? "").localeCompare(b ?? "");
  return {
    generated_at: new Date().toISOString(),
    totals: fin([total])[0],
    first_checkin: first,
    last_checkin: last,
    by_branch: fin([...byBranch.values()].sort((a, b) => cmp(a.branch_name, b.branch_name))),
    by_batch: fin([...byBatch.values()].sort((a, b) => cmp(a.batch, b.batch))),
    by_branch_batch: fin([...byPair.values()].sort((a, b) => cmp(a.branch_name, b.branch_name) || cmp(a.batch, b.batch))),
  };
}

reports.get("/reports/event-day", reviewer, async (c) => c.json(await eventDaySummary(c.env.DB, c.get("user"))));

reports.get("/export/event-day.csv", reviewer, async (c) => {
  const user = c.get("user");
  canExport(user);
  const s = await eventDaySummary(c.env.DB, user);
  const t = s.totals;
  const csv = toCsv([
    ["Branch", "Batch", "Registered", "Approved", "Checked In", "Absent", "Attendance %"],
    ...s.by_branch_batch.map((r) => [r.branch_name, r.batch, r.registered, r.approved, r.checked_in, r.absent, r.attendance_pct]),
    ...s.by_branch.map((r) => [r.branch_name, "ALL BATCHES", r.registered, r.approved, r.checked_in, r.absent, r.attendance_pct]),
    ["ALL BRANCHES", "ALL BATCHES", t.registered, t.approved, t.checked_in, t.absent, t.attendance_pct],
  ]);
  await audit(c.env.DB, user.id, "export.event_day_csv");
  return csvResponse(csv, "olam-event-day-summary.csv");
});

// --- Not arrived (approved, not checked in) -------------------------------------------------
async function absentReport(db: D1Database, user: User, requested?: string) {
  const branchId = scope(user, requested);
  const { results } = await db
    .prepare(
      `SELECT r.id, r.reference, r.full_name, r.mobile, r.email, r.branch_id, r.batch, r.batch_no, r.faculty_name, b.name AS branch_name
       FROM registrations r LEFT JOIN branches b ON b.id = r.branch_id LEFT JOIN attendance a ON a.registration_id = r.id
       WHERE r.status = 'approved' AND a.id IS NULL ${branchId ? "AND r.branch_id = ?" : ""}
       ORDER BY r.full_name COLLATE NOCASE`,
    )
    .bind(...(branchId ? [branchId] : []))
    .all<any>();
  const groups = new Map<string, any[]>();
  for (const r of results) {
    const name = r.branch_name ?? "?";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push({ ...r, branch_name: name });
  }
  const branches = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([branch_name, students]) => ({ branch_name, count: students.length, students }));
  return { total: results.length, branches };
}

reports.get("/reports/absent", reviewer, async (c) => c.json(await absentReport(c.env.DB, c.get("user"), c.req.query("branch_id"))));

reports.get("/export/absent.csv", reviewer, async (c) => {
  const user = c.get("user");
  canExport(user);
  const data = await absentReport(c.env.DB, user, c.req.query("branch_id"));
  const csv = toCsv([
    ["Branch", "Reference", "Name", "Mobile", "Email", "Batch", "Batch No.", "Faculty Name"],
    ...data.branches.flatMap((g) => g.students.map((s: any) => [g.branch_name, s.reference, s.full_name, s.mobile, s.email, s.batch, s.batch_no || "", s.faculty_name || ""])),
  ]);
  await audit(c.env.DB, user.id, "export.absent_csv", null, { rows: data.total });
  return csvResponse(csv, "olam-absent-students.csv");
});

// --- Full registrations export ----------------------------------------------------------------
reports.get("/export/registrations.csv", reviewer, async (c) => {
  const user = c.get("user");
  canExport(user);
  const own = coordinatorBranch(user);
  const { results } = await c.env.DB
    .prepare(
      `SELECT r.*, b.name AS branch_name, a.checked_in_at FROM registrations r
       LEFT JOIN branches b ON b.id = r.branch_id LEFT JOIN attendance a ON a.registration_id = r.id
       ${own ? "WHERE r.branch_id = ?" : ""} ORDER BY r.created_at`,
    )
    .bind(...(own ? [own] : []))
    .all<any>();
  const csv = toCsv([
    ["Reference", "Name", "Mobile", "Email", "Branch", "Batch", "Batch No.", "Faculty Name", "Status", "Reviewed By", "Checked In At", "Created At"],
    ...results.map((d) => [
      d.reference, d.full_name, d.mobile, d.email, d.branch_name || "", d.batch, d.batch_no || "", d.faculty_name || "", d.status,
      d.reviewed_by_name || "", d.checked_in_at || "", d.created_at,
    ]),
  ]);
  await audit(c.env.DB, user.id, "export.csv", null, { rows: results.length });
  return csvResponse(csv, "olam-registrations.csv");
});

export default reports;
