import { useCallback, useEffect, useState } from "react";
import { api, downloadCsv } from "../../api";
import { PageHead, canExportCsv, useStaff } from "../../components/Staff";
import { Button, Spinner, fmtTime } from "../../components/ui";

type Row = { branch_name?: string; batch?: string; registered: number; approved: number; checked_in: number; absent: number; attendance_pct: number };
type Summary = { generated_at: string; totals: Row; first_checkin?: string | null; last_checkin?: string | null; by_branch: Row[]; by_batch: Row[]; by_branch_batch: Row[] };

function RowCard({ title, row, testId }: { title: string; row: Row; testId: string }) {
  return (
    <div className="card" data-testid={testId}>
      <div className="item-top"><span className="name">{title}</span><span style={{ fontWeight: 700, color: "var(--success-text)" }}>{row.attendance_pct}%</span></div>
      <div className="bar"><i style={{ width: `${Math.min(row.attendance_pct, 100)}%` }} /></div>
      <p className="meta">
        <span style={{ color: "var(--success-text)" }}>{row.checked_in} present</span> • <span style={{ color: "var(--error-text)" }}>{row.absent} absent</span> • {row.approved} approved • {row.registered} registered
      </p>
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
    <div className="staff-shell">
      <PageHead eyebrow="REPORTS" title="Event day summary" sub="Who came and who didn't, by branch and batch." />
      <main className="staff-body">
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: 8 }}><button type="button" className="chip-btn" onClick={load}>↻ Refresh</button></div>
        {loading && !data ? <Spinner /> : null}
        {msg ? <p className="err" data-testid="summary-msg">{msg}</p> : null}
        {data && t ? (
          <>
            <div className="hero" data-testid="summary-totals">
              <div className="l">OVERALL ATTENDANCE</div>
              <div className="v" data-testid="summary-total-pct">{t.attendance_pct}%</div>
              <div className="small" style={{ opacity: 0.8 }}>{t.checked_in} of {t.approved} approved students checked in</div>
            </div>
            <div className="summary-boxes">
              <div className="sum-box"><div className="v" style={{ color: "var(--success-text)" }} data-testid="summary-present">{t.checked_in}</div><div className="l">PRESENT</div></div>
              <div className="sum-box"><div className="v" style={{ color: "var(--error-text)" }} data-testid="summary-absent">{t.absent}</div><div className="l">ABSENT</div></div>
              <div className="sum-box"><div className="v">{t.registered}</div><div className="l">REGISTERED</div></div>
            </div>
            <p className="meta center-text mt-12">First entry {fmtTime(data.first_checkin)} • Last entry {fmtTime(data.last_checkin)} • Updated {fmtTime(data.generated_at)}</p>
            {canExportCsv(user) ? (
              <Button variant="navy" className="mt-16" testId="summary-export-btn" onClick={async () => setMsg(await downloadCsv("/export/event-day.csv", "olam-event-day-summary.csv"))}>Download summary CSV</Button>
            ) : (
              <p className="meta mt-12" data-testid="summary-export-disabled">CSV download is not enabled for your account. Ask the admin if you need it.</p>
            )}
            <div className="chips mt-16" style={{ marginBottom: 12 }}>
              {([["branch", "By branch"], ["batch", "By batch"], ["both", "Branch + batch"]] as const).map(([k, l]) => (
                <button type="button" key={k} className={`chip ${view === k ? "on" : ""}`} onClick={() => setView(k)} data-testid={`summary-view-${k}`}>{l}</button>
              ))}
            </div>
            {view === "branch" ? data.by_branch.map((r) => <RowCard key={r.branch_name} title={r.branch_name!} row={r} testId={`summary-branch-${r.branch_name}`} />) : null}
            {view === "batch" ? data.by_batch.map((r) => <RowCard key={r.batch} title={r.batch!} row={r} testId={`summary-batch-${r.batch}`} />) : null}
            {view === "both" ? Object.entries(pairs).map(([b, rows]) => (
              <section key={b}>
                <div className="branch-title">{b}</div>
                {rows.map((r) => <RowCard key={`${b}-${r.batch}`} title={r.batch!} row={r} testId={`summary-pair-${b}-${r.batch}`} />)}
              </section>
            )) : null}
            {data.by_branch.length === 0 ? <p className="empty">No registrations yet.</p> : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
