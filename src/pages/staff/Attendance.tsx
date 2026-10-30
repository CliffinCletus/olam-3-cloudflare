import { useCallback, useEffect, useState } from "react";
import { api } from "../../api";
import { BranchFilter, PageHead, useBranches, useStaff } from "../../components/Staff";
import { Pill, Spinner, type Tone } from "../../components/ui";

type CheckIn = { id: string; checked_in_at: string; scanner_name?: string; station?: string; full_name: string; reference: string; batch: string; branch_name?: string };
type Attempt = { id: string; result: string; attempted_at: string; scanner_name?: string; station?: string; full_name?: string; reference?: string; batch?: string; branch_name?: string };
type Data = { checkins: CheckIn[]; attempts: Attempt[]; duplicate_count: number };

const RESULT_LABEL: Record<string, { label: string; tone: Tone }> = {
  ALREADY_CHECKED_IN: { label: "Duplicate", tone: "warning" },
  NOT_APPROVED: { label: "Not approved", tone: "error" },
  REVOKED: { label: "Revoked", tone: "error" },
  INVALID: { label: "Invalid QR", tone: "error" },
};
const fmt = (s: string) => new Date(s).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function Attendance() {
  const user = useStaff();
  const branches = useBranches(user?.role === "super_admin");
  const [branchId, setBranchId] = useState("");
  const [view, setView] = useState<"checkins" | "attempts">("checkins");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (bid: string) => {
    setLoading(true); setErr(null);
    try { setData(await api<Data>(`/attendance${bid ? `?branch_id=${bid}` : ""}`)); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (user) load(""); }, [user, load]);

  return (
    <div className="staff-shell">
      <PageHead eyebrow="ATTENDANCE HISTORY" title="Check-in log">
        <BranchFilter user={user} branches={branches} value={branchId} onChange={(id) => { setBranchId(id); load(id); }} testPrefix="attendance-branch" />
        <div className="segment">
          <button type="button" className={view === "checkins" ? "on" : ""} onClick={() => setView("checkins")} data-testid="attendance-view-checkins">Check-ins ({data?.checkins.length ?? 0})</button>
          <button type="button" className={view === "attempts" ? "on" : ""} onClick={() => setView("attempts")} data-testid="attendance-view-attempts">Refused scans ({data?.attempts.length ?? 0})</button>
        </div>
      </PageHead>
      <main className="staff-body">
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: 8 }}><button type="button" className="chip-btn" onClick={() => load(branchId)}>↻ Refresh</button></div>
        {loading ? <Spinner /> : null}
        {err ? <p className="err" data-testid="attendance-error">{err}</p> : null}
        {!loading && data && view === "checkins" ? (
          <>
            {data.checkins.length === 0 ? <p className="empty">No one has checked in yet.</p> : null}
            {data.checkins.map((c) => (
              <div className="card" key={c.id}>
                <div className="item-top"><span className="name">{c.full_name}</span><span className="small muted">{fmt(c.checked_in_at)}</span></div>
                <p className="meta">{c.reference} • {c.branch_name} • {c.batch}</p>
                <p className="meta">By {c.scanner_name || "—"} • Station {c.station || "—"}</p>
              </div>
            ))}
          </>
        ) : null}
        {!loading && data && view === "attempts" ? (
          <>
            <div className="card" style={{ background: "var(--tertiary)" }}>
              <div className="name" data-testid="attendance-duplicate-count">{data.duplicate_count} duplicate scan attempts</div>
              <p className="meta">Passes that were scanned again after entry. No second entry was recorded.</p>
            </div>
            {data.attempts.length === 0 ? <p className="empty">No refused scans.</p> : null}
            {data.attempts.map((a) => {
              const r = RESULT_LABEL[a.result] ?? { label: a.result, tone: "error" as Tone };
              return (
                <div className="card" key={a.id}>
                  <div className="item-top"><span className="name">{a.full_name || "Unknown pass"}</span><Pill label={r.label} tone={r.tone} /></div>
                  {a.reference ? <p className="meta">{a.reference} • {a.branch_name} • {a.batch}</p> : null}
                  <p className="meta">{fmt(a.attempted_at)} • By {a.scanner_name || "—"} • Station {a.station || "—"}</p>
                </div>
              );
            })}
          </>
        ) : null}
      </main>
    </div>
  );
}
