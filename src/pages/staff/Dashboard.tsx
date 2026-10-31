import {
  BellRing, CalendarCog, Check, CheckCircle2, ChevronRight, Clock, Download, GraduationCap, History, Mail, Phone, Plus, RefreshCw,
  ScanLine, Trash2, UserCheck, UserCog, UserX, Users, X, XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type Batch, type Branch, type Registration, api, del, downloadCsv, post } from "../../api";
import { BatchEditor, BranchRow } from "../../components/Editors";
import { BranchFilter, StaffShell, canExportCsv, useStaff } from "../../components/Staff";
import {
  Alert, Button, CheckBox, EmptyState, Field, IconButton, Modal, Pill, SearchInput, Segmented, Spinner, StatCard, fmtDateTime, statusTone,
} from "../../components/ui";

type Stats = { total: number; pending: number; approved: number; rejected: number; checked_in: number; not_checked_in: number; attendance_pct: number; by_branch: { branch: string; total: number; approved: number; checked_in: number }[] };
type Filter = "all" | "pending" | "approved" | "rejected";
type Tab = "overview" | "regs" | "settings";

/** Query string shared by the registrations list and its CSV export. */
function regParams(filter: Filter, branchId: string, q = "") {
  const p = new URLSearchParams();
  if (filter !== "all") p.set("status", filter);
  if (branchId) p.set("branch_id", branchId);
  if (q.trim()) p.set("q", q.trim());
  return p.toString();
}

const TITLES: Record<Tab, [string, string]> = {
  overview: ["Overview", "Registrations and entry at a glance."],
  regs: ["Registrations", "Review, approve and manage student registrations."],
  settings: ["Branches & batches", "What students can choose on the registration form."],
};

export default function Dashboard() {
  const nav = useNavigate();
  const user = useStaff(["super_admin", "coordinator"]);
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as Tab) || "overview";

  const [stats, setStats] = useState<Stats | null>(null);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [regBranch, setRegBranch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<Registration | null>(null);
  const [reason, setReason] = useState("");
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Registration[] | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [branchErr, setBranchErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, b, bt] = await Promise.all([
        api<Stats>("/stats"),
        api<Registration[]>(`/registrations?${regParams(filter, regBranch)}`),
        api<Branch[]>("/branches"),
        api<Batch[]>("/batches"),
      ]);
      setStats(s); setRegs(r); setBranches(b); setBatches(bt);
    } catch (e: any) { setNotice({ ok: false, text: e.message }); }
    finally { setLoading(false); }
  }, [filter, regBranch]);

  useEffect(() => { if (user) refresh(); }, [user, refresh]);

  const filtered = useMemo(() => {
    if (!query.trim()) return regs;
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return regs.filter((r) =>
      (digits.length >= 4 && r.mobile.replace(/\D/g, "").includes(digits)) ||
      [r.full_name, r.mobile, r.email, r.reference, r.batch, r.faculty_name || "", r.batch_no || ""].some((v) => v.toLowerCase().includes(q)),
    );
  }, [regs, query]);

  // Coordinators select pending registrations to approve; super admins can select any (approve or delete).
  const isAdmin = user?.role === "super_admin";
  const selectable = (r: Registration) => isAdmin || r.status === "pending";
  const selectableVisible = filtered.filter(selectable);
  const allSelected = selectableVisible.length > 0 && selectableVisible.every((r) => selected.has(r.id));
  const selectedRegs = regs.filter((r) => selected.has(r.id));
  const selectedPending = selectedRegs.filter((r) => r.status === "pending");
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const showRegs = (f: Filter) => { setFilter(f); setSelected(new Set()); setSp({ tab: "regs" }, { replace: true }); };

  async function approve(r: Registration) {
    setRowBusy(r.id); setNotice(null);
    try { await post(`/registrations/${r.id}/approve`); await refresh(); setNotice({ ok: true, text: `${r.full_name} approved. Their pass is ready in the app.` }); }
    catch (e: any) { setNotice({ ok: false, text: e.message }); }
    finally { setRowBusy(null); }
  }
  async function reject() {
    if (!rejecting || reason.trim().length < 3) return;
    try {
      await post(`/registrations/${rejecting.id}/reject`, { reason: reason.trim() });
      setNotice({ ok: true, text: `${rejecting.full_name} was rejected.` });
      setRejecting(null); setReason(""); refresh();
    } catch (e: any) { setNotice({ ok: false, text: e.message }); setRejecting(null); }
  }
  async function bulkApprove() {
    setBulkBusy(true);
    try {
      const r = await post<{ approved: number; skipped: unknown[] }>("/registrations/bulk-approve", { ids: selectedPending.map((x) => x.id) });
      setNotice({ ok: true, text: `${r.approved} approved${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}. Their passes are ready in the app.` });
      setSelected(new Set());
      refresh();
    } catch (e: any) { setNotice({ ok: false, text: e.message }); }
    finally { setBulkBusy(false); setBulkConfirm(false); }
  }
  async function confirmDelete() {
    if (!deleting?.length) return;
    setDeleteBusy(true);
    try {
      const r = deleting.length === 1
        ? await del<{ deleted: number }>(`/registrations/${deleting[0].id}`)
        : await post<{ deleted: number }>("/registrations/bulk-delete", { ids: deleting.map((x) => x.id) });
      setNotice({ ok: true, text: `${r.deleted} registration${r.deleted === 1 ? "" : "s"} deleted.` });
      setSelected(new Set());
      setDeleting(null);
      refresh();
    } catch (e: any) { setNotice({ ok: false, text: e.message }); setDeleting(null); }
    finally { setDeleteBusy(false); }
  }
  async function exportRegs() {
    const branchName = branches.find((b) => b.id === regBranch)?.name;
    const name = ["olam-registrations", filter, branchName, query.trim() ? "search" : ""].filter(Boolean).join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    const m = await downloadCsv(`/export/registrations.csv?${regParams(filter, regBranch, query)}`, `${name}.csv`);
    if (m) setNotice({ ok: false, text: m });
  }
  async function addBranch() {
    if (!newBranch.trim()) return;
    setBranchErr(null);
    try { await post("/branches", { name: newBranch.trim(), active: true }); setNewBranch(""); refresh(); }
    catch (e: any) { setBranchErr(e.message); }
  }

  const myBranch = branches.find((b) => b.id === user?.branch_id)?.name;
  const [title, sub] = TITLES[tab] ?? TITLES.overview;
  const counts: Record<Filter, number | undefined> = { all: stats?.total, pending: stats?.pending, approved: stats?.approved, rejected: stats?.rejected };

  const refreshBtn = <IconButton label={loading ? "Refreshing" : "Refresh"} icon={<RefreshCw />} loading={loading} onClick={refresh} testId="dashboard-refresh-btn" />;

  return (
    <StaffShell
      user={user}
      title={title}
      sub={tab === "overview" && user?.role === "coordinator" ? `${myBranch ?? "Your"} branch · ${user.name || user.email}` : sub}
      actions={tab !== "settings" ? refreshBtn : undefined}
    >
      {!user ? <Spinner /> : null}
      {notice ? <div className="mb-12"><Alert tone={notice.ok ? "success" : "error"} testId="dashboard-notice">{notice.text}</Alert></div> : null}

      {user && tab === "overview" && stats ? (
        <section>
          <div className="stat-grid">
            <StatCard label="Registered" value={stats.total} icon={<Users />} tone="crimson" testId="stat-total" onClick={() => showRegs("all")} />
            <StatCard label="Pending" value={stats.pending} icon={<Clock />} tone="yellow" testId="stat-pending" onClick={() => showRegs("pending")} />
            <StatCard label="Approved" value={stats.approved} icon={<CheckCircle2 />} tone="olive" testId="stat-approved" onClick={() => showRegs("approved")} />
            <StatCard label="Rejected" value={stats.rejected} icon={<XCircle />} tone="blush" testId="stat-rejected" onClick={() => showRegs("rejected")} />
            <StatCard label="Checked in" value={stats.checked_in} icon={<UserCheck />} tone="blue" testId="stat-checkedin" onClick={() => nav("/staff/attendance")} />
            <StatCard label="Not yet in" value={stats.not_checked_in} icon={<UserX />} tone="gold" testId="stat-notin" onClick={() => nav("/staff/absent")} />
          </div>

          <div className="grid-2">
            <div className="card">
              <div className="card-head"><div><div className="card-title">Attendance</div><div className="card-sub">Approved students who have entered</div></div></div>
              <div className="row" style={{ alignItems: "baseline", gap: 10 }}>
                <span className="big-num">{stats.attendance_pct}%</span>
                <span className="muted num">{stats.checked_in} of {stats.approved}</span>
              </div>
              <div className="progress mt-12"><i style={{ width: `${Math.min(stats.attendance_pct, 100)}%` }} /></div>
              {stats.by_branch.length ? (
                <div className="mt-16">
                  {stats.by_branch.map((b) => {
                    const pct = b.approved ? Math.round((b.checked_in / b.approved) * 100) : 0;
                    return (
                      <div className="branch-line" key={b.branch}>
                        <div className="top"><b>{b.branch}</b><span className="muted num">{b.checked_in}/{b.approved} in · {b.total} registered</span></div>
                        <div className="progress sm"><i style={{ width: `${pct}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="card">
              <div className="card-head"><div className="card-title">Quick actions</div></div>
              <div className="quick">
                <button type="button" onClick={() => showRegs("pending")}>
                  <span className="ico" style={{ background: "var(--yellow-100)", color: "var(--yellow-800)" }}><Clock /></span>
                  <span><b>Review pending</b><span className="d">{stats.pending} waiting for approval</span></span><ChevronRight />
                </button>
                <button type="button" onClick={() => nav("/staff/scanner")}>
                  <span className="ico" style={{ background: "var(--c-100)", color: "var(--c-700)" }}><ScanLine /></span>
                  <span><b>Open gate scanner</b><span className="d">Scan student passes at the entrance</span></span><ChevronRight />
                </button>
                <button type="button" onClick={() => nav("/staff/absent")}>
                  <span className="ico" style={{ background: "var(--gold-100)", color: "var(--gold-700)" }}><UserX /></span>
                  <span><b>Not arrived yet</b><span className="d">Call or WhatsApp latecomers</span></span><ChevronRight />
                </button>
                {canExportCsv(user) ? (
                  <button type="button" data-testid="dashboard-export-btn" onClick={async () => { const m = await downloadCsv("/export/registrations.csv", "olam-registrations.csv"); if (m) setNotice({ ok: false, text: m }); }}>
                    <span className="ico" style={{ background: "var(--blue-100)", color: "var(--blue-600)" }}><Download /></span>
                    <span><b>Export all registrations</b><span className="d">CSV for Excel or Google Sheets</span></span><ChevronRight />
                  </button>
                ) : (
                  <p className="meta" data-testid="dashboard-export-disabled">CSV download is not enabled for your account. Ask the admin if you need it.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}
      {user && tab === "overview" && !stats && loading ? <Spinner /> : null}

      {user && tab === "regs" ? (
        <section>
          <Segmented
            label="Status"
            value={filter}
            onChange={(f) => { setFilter(f); setSelected(new Set()); }}
            testPrefix="dashboard-filter"
            options={(["pending", "approved", "rejected", "all"] as const).map((f) => ({ id: f, name: f === "all" ? "All" : f[0].toUpperCase() + f.slice(1), count: counts[f] }))}
          />
          <div className="toolbar mt-12">
            <SearchInput value={query} onChange={setQuery} placeholder="Search name, phone, reference, faculty…" testId="dashboard-search-input" label="Search registrations" />
            <BranchFilter user={user} branches={branches} value={regBranch} onChange={(id) => { setRegBranch(id); setSelected(new Set()); }} testPrefix="regs-branch" />
            {canExportCsv(user) ? (
              <Button variant="secondary" small block={false} icon={<Download />} testId="regs-export-btn" onClick={exportRegs}>Export {filtered.length}</Button>
            ) : null}
          </div>

          {selectableVisible.length > 0 ? (
            <div className="row between mb-12">
              <button type="button" className="select-all" onClick={() => setSelected(allSelected ? new Set() : new Set(selectableVisible.map((r) => r.id)))} data-testid="bulk-select-all-btn">
                <CheckBox on={allSelected} />
                {allSelected ? "Unselect all" : isAdmin ? `Select all ${selectableVisible.length} shown` : `Select all ${selectableVisible.length} pending`}
              </button>
              <span className="small muted num">{filtered.length} shown</span>
            </div>
          ) : null}

          {filtered.length === 0 && !loading ? (
            <EmptyState icon={<Users />} title="No registrations here">{query ? "Try a different search." : "Nothing matches this filter yet."}</EmptyState>
          ) : null}

          {filtered.length > 0 ? (
            <div className="reg-list">
              <div className="reg-head"><span /><span>Student</span><span>Branch · batch</span><span>Contact</span><span>Status</span><span style={{ textAlign: "right" }}>Actions</span></div>
              {filtered.map((r) => (
                <div className={`reg ${selected.has(r.id) ? "selected" : ""}`} key={r.id} data-testid={`reg-card-${r.id}`}>
                  <div className="sel">
                    {selectable(r) ? (
                      <button type="button" className="sel-box" onClick={() => toggle(r.id)} aria-label={`Select ${r.full_name}`} data-testid={`select-reg-${r.id}`}>
                        <CheckBox on={selected.has(r.id)} />
                      </button>
                    ) : null}
                  </div>
                  <div className="who">
                    <span className="name" data-testid={`reg-name-${r.id}`}>{r.full_name}</span>
                    <span className="ref">{r.reference}</span>
                    <div className="meta-row" style={{ marginTop: 4 }}>
                      <span className="hide-desk">{r.branch_name} · {r.batch}{r.batch_no ? ` · No. ${r.batch_no}` : ""}</span>
                      {r.faculty_name ? <span><GraduationCap />{r.faculty_name}</span> : null}
                    </div>
                  </div>
                  <div className="col-sm desk">{r.branch_name}<br />{r.batch}{r.batch_no ? ` · No. ${r.batch_no}` : ""}</div>
                  <div className="col-sm">
                    <div className="meta-row" style={{ marginTop: 0 }}>
                      <span><Phone />{r.mobile}</span>
                      <span className="trunc" title={r.email}><Mail /><span>{r.email}</span></span>
                    </div>
                  </div>
                  <div className="status">
                    <Pill label={r.status} tone={statusTone(r.status)} />
                    {r.checked_in ? <Pill label="Checked in" tone="info" /> : null}
                  </div>
                  <div className="acts">
                    {r.status !== "approved" ? (
                      <Button small block={false} variant="success" icon={<Check />} loading={rowBusy === r.id} onClick={() => approve(r)} testId={`approve-btn-${r.id}`}>Approve</Button>
                    ) : null}
                    <span className="spacer" />
                    {r.status !== "rejected" && (r.status !== "approved" || isAdmin) ? (
                      <IconButton small label={`Reject ${r.full_name}`} icon={<X />} onClick={() => setRejecting(r)} testId={`reject-btn-${r.id}`} />
                    ) : null}
                    {isAdmin ? <IconButton small variant="danger" label={`Delete ${r.full_name}`} icon={<Trash2 />} onClick={() => setDeleting([r])} testId={`delete-btn-${r.id}`} /> : null}
                  </div>
                  {r.checked_in || (r.reviewed_by_name && r.status !== "pending") || r.rejection_reason ? (
                    <div className={`note ${r.rejection_reason ? "bad" : ""}`}>
                      {r.checked_in ? `Checked in ${fmtDateTime(r.checked_in_at)}` : ""}
                      {r.checked_in && r.reviewed_by_name ? " · " : ""}
                      {r.reviewed_by_name && r.status !== "pending" ? `${r.status === "approved" ? "Approved" : "Rejected"} by ${r.reviewed_by_name}` : ""}
                      {r.rejection_reason ? ` · Reason: ${r.rejection_reason}` : ""}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {selected.size > 0 ? (
            <div className="bulk-bar" data-testid="bulk-bar">
              <span className="count num">{selected.size} selected</span>
              <span className="spacer" />
              {selectedPending.length > 0 || !isAdmin ? <Button small block={false} variant="success" icon={<Check />} disabled={selectedPending.length === 0} onClick={() => setBulkConfirm(true)} testId="bulk-approve-btn">Approve ({selectedPending.length})</Button> : null}
              {isAdmin ? <Button small block={false} variant="danger" icon={<Trash2 />} onClick={() => setDeleting(selectedRegs)} testId="bulk-delete-btn">Delete ({selectedRegs.length})</Button> : null}
              <IconButton small onDark label="Clear selection" icon={<X />} onClick={() => setSelected(new Set())} />
            </div>
          ) : null}
        </section>
      ) : null}

      {user && tab === "settings" && isAdmin ? (
        <section>
          <div className="grid-2" style={{ marginTop: 0 }}>
            <div>
              <div className="group-title">Branches</div>
              <div className="list">
                {branches.map((b) => <BranchRow key={b.id} branch={b} onSaved={refresh} />)}
                <form className="add-row" onSubmit={(e) => { e.preventDefault(); addBranch(); }}>
                  <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="New branch name" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} data-testid="new-branch-input" aria-label="New branch name" maxLength={80} />
                  <Button small block={false} type="submit" icon={<Plus />} testId="add-branch-btn">Add</Button>
                </form>
              </div>
              {branchErr ? <Alert tone="error">{branchErr}</Alert> : null}
              <p className="meta mt-8">Switched-off branches disappear from the student form; existing registrations are kept.</p>
            </div>
            <div>
              <div className="group-title">Batches</div>
              <BatchEditor batches={batches} onChanged={refresh} />
              <p className="meta mt-8">Shown on the registration form in this order. Renaming a batch also renames it on existing registrations.</p>
            </div>
          </div>
          <div className="settings-links">
            {([
              ["/staff/event-settings", "Event settings", "Open or close registration, privacy notice, date & venue", "event-settings-btn", <CalendarCog key="i" />, "var(--c-100)", "var(--c-700)"],
              ["/staff/notifications", "Push reminders", "Send a notification to students' phones", "notifications-btn", <BellRing key="i" />, "var(--blue-100)", "var(--blue-600)"],
              ["/staff/manage", "Staff accounts", "Coordinators and scanners, passwords, CSV access", "manage-staff-btn", <UserCog key="i" />, "var(--olive-100)", "var(--olive-700)"],
              ["/staff/audit", "Activity log", "Sign-ins, approvals, exports and changes", "audit-log-btn", <History key="i" />, "var(--gold-100)", "var(--gold-700)"],
            ] as const).map(([to, t, s, id, icon, bg, fg]) => (
              <button type="button" key={to} onClick={() => nav(to)} data-testid={id}>
                <span className="ico" style={{ background: bg, color: fg }}>{icon}</span>
                <span><b>{t}</b><span className="d">{s}</span></span>
                <ChevronRight />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <Modal open={bulkConfirm} onClose={() => setBulkConfirm(false)}>
        <div className="modal-ico success"><CheckCircle2 /></div>
        <h2>Approve {selectedPending.length} students?</h2>
        <p className="sub">Each student's QR pass appears in their app straight away. You can still reject any of them later.</p>
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setBulkConfirm(false)} testId="bulk-cancel-btn">Cancel</Button>
          <Button variant="success" icon={<Check />} loading={bulkBusy} onClick={bulkApprove} testId="bulk-confirm-btn">Approve all</Button>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => !deleteBusy && setDeleting(null)}>
        <div className="modal-ico"><Trash2 /></div>
        <h2>Delete {deleting?.length === 1 ? "this registration" : `${deleting?.length} registrations`}?</h2>
        <p className="sub">
          {deleting?.length === 1 ? `${deleting[0].full_name} · ${deleting[0].reference}` : `${deleting?.slice(0, 3).map((r) => r.full_name).join(", ")}${(deleting?.length ?? 0) > 3 ? ` and ${(deleting?.length ?? 0) - 3} more` : ""}`}
        </p>
        <Alert tone="warning">This permanently removes the registration, its QR pass and check-in. It can't be undone. The same email and mobile number can register again.</Alert>
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setDeleting(null)} disabled={deleteBusy} testId="delete-cancel-btn">Cancel</Button>
          <Button variant="danger" icon={<Trash2 />} loading={deleteBusy} onClick={confirmDelete} testId="delete-confirm-btn">Delete</Button>
        </div>
      </Modal>

      <Modal open={!!rejecting} onClose={() => { setRejecting(null); setReason(""); }}>
        <div className="modal-ico"><XCircle /></div>
        <h2>Reject registration</h2>
        <p className="sub" style={{ marginBottom: 14 }}>{rejecting?.full_name} · {rejecting?.reference}</p>
        <Field label="Reason" htmlFor="rej-reason" hint="The student sees this in the app.">
          <textarea id="rej-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Not a current student" maxLength={400} data-testid="reject-reason-input" />
        </Field>
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => { setRejecting(null); setReason(""); }} testId="reject-cancel-btn">Cancel</Button>
          <Button variant="danger" disabled={reason.trim().length < 3} onClick={reject} testId="confirm-reject-btn">Reject</Button>
        </div>
      </Modal>
    </StaffShell>
  );
}
