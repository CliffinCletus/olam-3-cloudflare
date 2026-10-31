import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type Batch, type Branch, type Registration, api, clearSession, del, downloadCsv, post } from "../../api";
import { BatchEditor, BranchRow } from "../../components/Editors";
import { BranchFilter, canExportCsv, useStaff } from "../../components/Staff";
import { Button, Field, Modal, Pill, Spinner, fmtDateTime, statusTone } from "../../components/ui";

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

export default function Dashboard() {
  const nav = useNavigate();
  const user = useStaff(["super_admin", "coordinator"]);
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as Tab) || "overview";
  const setTab = (t: Tab) => setSp(t === "overview" ? {} : { tab: t }, { replace: true });

  const [stats, setStats] = useState<Stats | null>(null);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [regBranch, setRegBranch] = useState("");
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<Registration[] | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<Registration | null>(null);
  const [reason, setReason] = useState("");
  const [rowBusy, setRowBusy] = useState<string | null>(null);
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
  const isAdminUser = user?.role === "super_admin";
  const selectable = (r: Registration) => isAdminUser || r.status === "pending";
  const selectableVisible = filtered.filter(selectable);
  const allSelected = selectableVisible.length > 0 && selectableVisible.every((r) => selected.has(r.id));
  const selectedRegs = regs.filter((r) => selected.has(r.id));
  const selectedPending = selectedRegs.filter((r) => r.status === "pending");
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function exportRegs() {
    const params = regParams(filter, regBranch, query);
    const branchName = branches.find((b) => b.id === regBranch)?.name;
    const name = ["olam-registrations", filter, branchName, query.trim() ? "search" : ""].filter(Boolean).join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    const m = await downloadCsv(`/export/registrations.csv?${params}`, `${name}.csv`);
    if (m) setNotice({ ok: false, text: m });
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

  async function approve(r: Registration) {
    setRowBusy(r.id); setNotice(null);
    try { await post(`/registrations/${r.id}/approve`); await refresh(); setNotice({ ok: true, text: `${r.full_name} approved. They can now download their pass from “Retrieve my pass”.` }); }
    catch (e: any) { setNotice({ ok: false, text: e.message }); }
    finally { setRowBusy(null); }
  }
  async function reject() {
    if (!rejecting || reason.trim().length < 3) return;
    try {
      await post(`/registrations/${rejecting.id}/reject`, { reason: reason.trim() });
      setRejecting(null); setReason(""); refresh();
    } catch (e: any) { setNotice({ ok: false, text: e.message }); setRejecting(null); }
  }
  async function bulkApprove() {
    setBulkBusy(true);
    try {
      const r = await post<{ approved: number; skipped: unknown[] }>("/registrations/bulk-approve", { ids: selectedPending.map((x) => x.id) });
      setNotice({ ok: true, text: `${r.approved} approved${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}. Students can now download their passes.` });
      setSelected(new Set());
      refresh();
    } catch (e: any) { setNotice({ ok: false, text: e.message }); }
    finally { setBulkBusy(false); setBulkConfirm(false); }
  }
  async function addBranch() {
    if (!newBranch.trim()) return;
    setBranchErr(null);
    try { await post("/branches", { name: newBranch.trim(), active: true }); setNewBranch(""); refresh(); }
    catch (e: any) { setBranchErr(e.message); }
  }

  if (!user) return <div className="staff-shell"><Spinner /></div>;
  const isAdmin = user.role === "super_admin";
  const myBranch = branches.find((b) => b.id === user.branch_id)?.name;

  const tabs: [string, string, () => void][] = [
    ["overview", "Overview", () => setTab("overview")],
    ["regs", "Registrations", () => setTab("regs")],
    ["attendance", "Attendance", () => nav("/staff/attendance")],
    ["faculty", "Faculty", () => nav("/staff/faculty-report")],
    ["summary", "Day Summary", () => nav("/staff/event-summary")],
    ["absent", "Not Arrived", () => nav("/staff/absent")],
    ...(isAdmin ? ([["settings", "Settings", () => setTab("settings")]] as [string, string, () => void][]) : []),
    ["scanner", "Scanner", () => nav("/staff/scanner")],
  ];

  return (
    <div className="staff-shell">
      <header className="staff-header">
        <div className="top">
          <div className="eyebrow" style={{ minWidth: 0 }}>{isAdmin ? "OLAM 3.0 • ADMIN • ALL BRANCHES" : `${myBranch ?? "YOUR"} BRANCH`}</div>
          <div className="actions">
            <button type="button" className="head-link" onClick={() => nav("/staff/change-password")} data-testid="dashboard-change-password-btn">Password</button>
            <button type="button" className="head-link" onClick={() => { clearSession(); nav("/staff/login", { replace: true }); }} data-testid="dashboard-logout-btn">Sign out</button>
          </div>
        </div>
        <div className="hello">{user.role === "coordinator" ? "Coordinator · " : "Hi, "}{user.name || user.email}</div>
      </header>
      <nav className="tabs" aria-label="Dashboard sections">
        {tabs.map(([k, l, go]) => (
          <button type="button" key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={go} data-testid={`dashboard-tab-${k}`}>{l}</button>
        ))}
      </nav>

      <main className="staff-body">
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: 8 }}>
          <button type="button" className="chip-btn" onClick={refresh} disabled={loading} data-testid="dashboard-refresh-btn">{loading ? "Refreshing…" : "↻ Refresh"}</button>
        </div>
        {notice ? <div className={`notice ${notice.ok ? "" : "bad"}`} style={{ marginTop: 0, marginBottom: 12 }} data-testid="dashboard-notice">{notice.text}</div> : null}

        {tab === "overview" && stats ? (
          <section>
            <div className="stat-grid">
              {[
                ["Total", stats.total, "var(--gold-text)", "stat-total"],
                ["Pending", stats.pending, "var(--warning-text)", "stat-pending"],
                ["Approved", stats.approved, "var(--success-text)", "stat-approved"],
                ["Rejected", stats.rejected, "var(--error-text)", "stat-rejected"],
                ["Checked In", stats.checked_in, "#1d4ed8", "stat-checkedin"],
                ["Not Yet In", stats.not_checked_in, "var(--gold-text)", "stat-notin"],
              ].map(([l, v, c, id]) => (
                <div className="stat" key={id as string} data-testid={id as string}>
                  <div className="v" style={{ color: c as string }}>{v as number}</div>
                  <div className="l">{l as string}</div>
                </div>
              ))}
            </div>
            <div className="card mt-16">
              <div className="card-title">Attendance</div>
              <div className="big-num">{stats.attendance_pct}%</div>
              <p className="meta">{stats.checked_in} / {stats.approved} approved students checked in</p>
            </div>
            {stats.by_branch.length ? (
              <div className="card mt-16">
                <div className="card-title" style={{ marginBottom: 6 }}>By Branch</div>
                {stats.by_branch.map((b) => (
                  <div className="branch-line" key={b.branch}><span className="name">{b.branch}</span><span className="muted">{b.checked_in}/{b.approved} in • {b.total} total</span></div>
                ))}
              </div>
            ) : null}
            {canExportCsv(user) ? (
              <Button variant="navy" className="mt-16" testId="dashboard-export-btn" onClick={async () => { const m = await downloadCsv("/export/registrations.csv", "olam-registrations.csv"); if (m) setNotice({ ok: false, text: m }); }}>
                Export CSV
              </Button>
            ) : (
              <p className="meta center-text mt-16" data-testid="dashboard-export-disabled">CSV download is not enabled for your account. Ask the admin if you need it.</p>
            )}
          </section>
        ) : null}
        {tab === "overview" && !stats && loading ? <Spinner /> : null}

        {tab === "regs" ? (
          <section>
            <input className="input" placeholder="Search name, phone, ref, batch, faculty..." value={query} onChange={(e) => setQuery(e.target.value)} data-testid="dashboard-search-input" aria-label="Search registrations" />
            <div className="chips mt-12">
              {(["all", "pending", "approved", "rejected"] as const).map((f) => (
                <button type="button" key={f} className={`chip ${filter === f ? "on" : ""}`} onClick={() => { setFilter(f); setSelected(new Set()); }} data-testid={`dashboard-filter-${f}`}>{f.toUpperCase()}</button>
              ))}
            </div>
            <BranchFilter user={user} branches={branches} value={regBranch} onChange={(id) => { setRegBranch(id); setSelected(new Set()); }} testPrefix="regs-branch" />
            {canExportCsv(user) ? (
              <Button variant="navy" small className="mt-12" testId="regs-export-btn" onClick={exportRegs}>
                Export these {filtered.length} as CSV
              </Button>
            ) : null}
            {selectableVisible.length > 0 ? (
              <div className="bulk-bar" data-testid="bulk-bar">
                <button type="button" className="sel" onClick={() => setSelected(allSelected ? new Set() : new Set(selectableVisible.map((r) => r.id)))} data-testid="bulk-select-all-btn">
                  <span className={`cb ${allSelected ? "on" : ""}`}>{allSelected ? "✓" : ""}</span>
                  {allSelected ? "Unselect all" : isAdmin ? `Select all shown (${selectableVisible.length})` : `Select all pending (${selectableVisible.length})`}
                </button>
                <div className="row" style={{ gap: 8 }}>
                  <Button small className="btn-auto" disabled={selectedPending.length === 0} onClick={() => setBulkConfirm(true)} testId="bulk-approve-btn">Approve selected ({selectedPending.length})</Button>
                  {isAdmin ? (
                    <Button small variant="danger" className="btn-auto" disabled={selectedRegs.length === 0} onClick={() => setDeleting(selectedRegs)} testId="bulk-delete-btn">Delete selected ({selectedRegs.length})</Button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {filtered.length === 0 && !loading ? <p className="empty">No registrations match.</p> : null}
            <div className="reg-grid">
              {filtered.map((r) => (
                <div className="card" key={r.id} data-testid={`reg-card-${r.id}`}>
                  <div className="item-top">
                    {selectable(r) ? (
                      <button type="button" className="sel-box" onClick={() => toggle(r.id)} aria-label={`Select ${r.full_name}`} data-testid={`select-reg-${r.id}`}>
                        <span className={`cb ${selected.has(r.id) ? "on" : ""}`}>{selected.has(r.id) ? "✓" : ""}</span>
                      </button>
                    ) : null}
                    <span className="name" data-testid={`reg-name-${r.id}`}>{r.full_name}</span>
                    <Pill label={r.status} tone={statusTone(r.status)} />
                  </div>
                  <p className="meta">{r.reference} • {r.branch_name} • {r.batch}</p>
                  <p className="meta">{r.mobile} • {r.email}</p>
                  {r.batch_no || r.faculty_name ? <p className="meta">Batch No. {r.batch_no || "—"} • Faculty: {r.faculty_name || "—"}</p> : null}
                  {r.checked_in ? <p className="meta" style={{ color: "var(--success-text)" }}>Checked in {fmtDateTime(r.checked_in_at)}</p> : null}
                  {r.reviewed_by_name && r.status !== "pending" ? <p className="meta">{r.status === "approved" ? "Approved" : "Rejected"} by {r.reviewed_by_name}</p> : null}
                  {r.rejection_reason ? <p className="meta" style={{ color: "var(--error-text)" }}>Reason: {r.rejection_reason}</p> : null}
                  {r.status !== "approved" || isAdmin ? (
                    <div className="actions-row">
                      {r.status !== "approved" ? <Button small loading={rowBusy === r.id} onClick={() => approve(r)} testId={`approve-btn-${r.id}`}>Approve</Button> : null}
                      {r.status !== "rejected" ? <Button small variant="ghost" onClick={() => setRejecting(r)} testId={`reject-btn-${r.id}`}>Reject</Button> : null}
                      {isAdmin ? <Button small variant="danger" onClick={() => setDeleting([r])} testId={`delete-btn-${r.id}`}>Delete</Button> : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tab === "settings" && isAdmin ? (
          <section>
            <div className="card">
              <div className="card-title">Branches</div>
              <p className="meta">Rename a branch or switch it off. Switched-off branches disappear from the student form; existing registrations are kept.</p>
              <div className="mt-8">{branches.map((b) => <BranchRow key={b.id} branch={b} onSaved={refresh} />)}</div>
              <form className="row mt-12" onSubmit={(e) => { e.preventDefault(); addBranch(); }}>
                <input className="input grow" placeholder="New branch name" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} data-testid="new-branch-input" aria-label="New branch name" maxLength={80} />
                <Button small type="submit" className="btn-auto" testId="add-branch-btn">Add</Button>
              </form>
              {branchErr ? <p className="err">{branchErr}</p> : null}
            </div>
            <div className="card mt-16">
              <div className="card-title">Batches</div>
              <p className="meta">Shown as choices on the registration form, in this order. Renaming a batch also renames it on existing registrations.</p>
              <div className="mt-8"><BatchEditor batches={batches} onChanged={refresh} /></div>
            </div>
            {[
              ["/staff/event-settings", "Event Settings →", "Open or close registration, privacy notice, event date & venue", "event-settings-btn"],
              ["/staff/notifications", "Push Reminders →", "Send a notification to students' phones that turned on reminders", "notifications-btn"],
              ["/staff/manage", "Manage Staff Accounts →", "Create coordinators and scanners, reset passwords, CSV access", "manage-staff-btn"],
              ["/staff/audit", "Activity Log →", "Recent sign-ins, approvals, exports and changes", "audit-log-btn"],
            ].map(([to, t, s, id]) => (
              <button type="button" key={to} className="card mt-16" style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "block" }} onClick={() => nav(to)} data-testid={id}>
                <div className="card-title">{t}</div>
                <p className="meta">{s}</p>
              </button>
            ))}
          </section>
        ) : null}
      </main>

      <Modal open={bulkConfirm} onClose={() => setBulkConfirm(false)}>
        <h2>Approve {selectedPending.length} students?</h2>
        <p className="sub">Each student gets a QR pass they can download from “Retrieve my pass”. You can still reject any of them later.</p>
        <div className="row mt-16">
          <Button variant="ghost" onClick={() => setBulkConfirm(false)} testId="bulk-cancel-btn">Cancel</Button>
          <Button loading={bulkBusy} onClick={bulkApprove} testId="bulk-confirm-btn">Approve all</Button>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => !deleteBusy && setDeleting(null)}>
        <h2>Delete {deleting?.length === 1 ? "this registration" : `${deleting?.length} registrations`}?</h2>
        <p className="sub">
          {deleting?.length === 1 ? `${deleting[0].full_name} • ${deleting[0].reference}` : `${deleting?.slice(0, 3).map((r) => r.full_name).join(", ")}${(deleting?.length ?? 0) > 3 ? ` and ${(deleting?.length ?? 0) - 3} more` : ""}`}
        </p>
        <p className="meta mt-12">This permanently removes the registration, its QR pass and its check-in. It cannot be undone. The same email and mobile number can register again.</p>
        <div className="row mt-16">
          <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deleteBusy} testId="delete-cancel-btn">Cancel</Button>
          <Button variant="danger" loading={deleteBusy} onClick={confirmDelete} testId="delete-confirm-btn">Delete</Button>
        </div>
      </Modal>

      <Modal open={!!rejecting} onClose={() => { setRejecting(null); setReason(""); }}>
        <h2>Reject registration</h2>
        <p className="sub" style={{ marginBottom: 12 }}>{rejecting?.full_name} • {rejecting?.reference}</p>
        <Field label="Reason" htmlFor="rej-reason">
          <textarea id="rej-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Visible to the student" maxLength={400} data-testid="reject-reason-input" />
        </Field>
        <div className="row">
          <Button variant="ghost" onClick={() => { setRejecting(null); setReason(""); }} testId="reject-cancel-btn">Cancel</Button>
          <Button variant="danger" disabled={reason.trim().length < 3} onClick={reject} testId="confirm-reject-btn">Reject</Button>
        </div>
      </Modal>
    </div>
  );
}
