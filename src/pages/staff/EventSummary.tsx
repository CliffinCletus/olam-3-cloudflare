import { BarChart3, Download, RefreshCw, UserCheck, Users, UserX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, downloadCsv } from "../../api";
import { StaffShell, canExportCsv, useStaff } from "../../components/Staff";
import { Alert, Button, EmptyState, IconButton, Segmented, Spinner, StatCard, fmtTime } from "../../components/ui";

type Row = { branch_name?: string; batch?: string; registered: number; approved: number; checked_in: number; absent: number; attendance_pct: number };
type Summary = { generated_at: string; totals: Row; first_checkin?: string | null; last_checkin?: string | null; by_branch: Row[]; by_batch: Row[]; by_branch_batch: Row[] };

function RowItem({ title, row, testId }: { title: string; row: Row; testId: string }) {
  return (
    <div className="list-item col" data-testid={testId}>
      <div className="item-top"><span className="name">{title}</span><b className="num" style={{ color: "var(--olive-700)" }}>{row.attendance_pct}%</b></div>
      <div className="progress"><i style={{ width: `${Math.min(row.attendance_pct, 100)}%` }} /></div>
      <div className="meta num">{row.checked_in} present · {row.absent} absent · {row.approved} approved · {row.registered} registered</div>
    </div>
  );
}

export default function EventSummary() {
  const user = useStaff();
  const [data, setData] = useState<Summary | null>(null);
  const [view, setView] = useState<"branch" | "batch" | "both">("branch");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api<Summary>("/reports/event-day")); setMsg(null); }
    catch (e: any) { setMsg(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (user) load(); }, [user, load]);

  const t = data?.totals;
  const pairs = (data?.by_branch_batch ?? []).reduce<Record<string, Row[]>>((g, r) => { (g[r.branch_name!] ||= []).push(r); return g; }, {});

  return (
    <StaffShell user={user} title="Day summary" sub="Who came and who didn't, by branch and batch."
      actions={<>
        {canExportCsv(user) ? <Button variant="secondary" small block={false} icon={<Download />} testId="summary-export-btn" onClick={async () => setMsg(await downloadCsv("/export/event-day.csv", "olam-event-day-summary.csv"))}>Export CSV</Button> : null}
        <IconButton label="Refresh" icon={<RefreshCw />} loading={loading} onClick={load} />
      </>}>
      {loading && !data ? <Spinner /> : null}
      {msg ? <div className="mb-12"><Alert tone="error" testId="summary-msg">{msg}</Alert></div> : null}
      {!canExportCsv(user) ? <p className="meta mb-12" data-testid="summary-export-disabled">CSV download is not enabled for your account. Ask the admin if you need it.</p> : null}
      {data && t ? (
        <>
          <div className="hero-card" data-testid="summary-totals">
            <div style={{ flex: "1 1 220px" }}>
              <div className="l">Overall attendance</div>
              <div className="v" data-testid="summary-total-pct">{t.attendance_pct}%</div>
              <div className="s">{t.checked_in} of {t.approved} approved students checked in</div>
              <div className="progress"><i style={{ width: `${Math.min(t.attendance_pct, 100)}%` }} /></div>
            </div>
            <div className="s" style={{ textAlign: "right" }}>First entry {fmtTime(data.first_checkin)}<br />Last entry {fmtTime(data.last_checkin)}<br />Updated {fmtTime(data.generated_at)}</div>
          </div>
          <div className="summary-boxes">
            <StatCard label="Present" value={<span data-testid="summary-present">{t.checked_in}</span>} icon={<UserCheck />} tone="olive" />
            <StatCard label="Absent" value={<span data-testid="summary-absent">{t.absent}</span>} icon={<UserX />} tone="crimson" />
            <StatCard label="Registered" value={t.registered} icon={<Users />} tone="blue" />
          </div>
          <div className="mt-16">
            <Segmented label="Group by" value={view} onChange={setView} testPrefix="summary-view" options={[
              { id: "branch", name: "By branch" }, { id: "batch", name: "By batch" }, { id: "both", name: "Branch + batch" },
            ]} />
          </div>
          <div className="mt-12">
            {view === "branch" ? <div className="list">{data.by_branch.map((r) => <RowItem key={r.branch_name} title={r.branch_name!} row={r} testId={`summary-branch-${r.branch_name}`} />)}</div> : null}
            {view === "batch" ? <div className="list">{data.by_batch.map((r) => <RowItem key={r.batch} title={r.batch!} row={r} testId={`summary-batch-${r.batch}`} />)}</div> : null}
            {view === "both" ? Object.entries(pairs).map(([b, rows]) => (
              <section key={b}>
                <div className="group-title">{b}</div>
                <div className="list">{rows.map((r) => <RowItem key={`${b}-${r.batch}`} title={r.batch!} row={r} testId={`summary-pair-${b}-${r.batch}`} />)}</div>
              </section>
            )) : null}
          </div>
          {data.by_branch.length === 0 ? <EmptyState icon={<BarChart3 />} title="No registrations yet" /> : null}
        </>
      ) : null}
    </StaffShell>
  );
}
