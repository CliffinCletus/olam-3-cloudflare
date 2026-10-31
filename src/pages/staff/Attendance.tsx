import { AlertTriangle, ClipboardCheck, Copy, Download, RefreshCw, ShieldX, UserCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, downloadCsv } from "../../api";
import { BranchFilter, StaffShell, canExportCsv, useBranches, useStaff } from "../../components/Staff";
import { Alert, Button, EmptyState, IconButton, Pill, Segmented, Spinner, type Tone } from "../../components/ui";

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

  async function exportCsv() {
    const branchName = branches.find((b) => b.id === branchId)?.name;
    const name = ["olam-attendance", view === "checkins" ? "checkins" : "refused-scans", branchName].filter(Boolean).join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    const qs = new URLSearchParams({ view, ...(branchId ? { branch_id: branchId } : {}) });
    const m = await downloadCsv(`/export/attendance.csv?${qs}`, `${name}.csv`);
    if (m) setErr(m);
  }

  return (
    <StaffShell user={user} title="Check-in log" sub="Everyone who has entered, plus refused and duplicate scans."
      actions={<IconButton label="Refresh" icon={<RefreshCw />} loading={loading} onClick={() => load(branchId)} />}>
      <Segmented label="View" value={view} onChange={setView} options={[
        { id: "checkins", name: "Check-ins", count: data?.checkins.length },
        { id: "attempts", name: "Refused scans", count: data?.attempts.length },
      ]} testPrefix="attendance-view" />
      <div className="toolbar mt-12">
        <BranchFilter user={user} branches={branches} value={branchId} onChange={(id) => { setBranchId(id); load(id); }} testPrefix="attendance-branch" />
        <span style={{ flex: 1 }} />
        {canExportCsv(user) ? (
          <Button variant="secondary" small block={false} icon={<Download />} testId="attendance-export-btn" onClick={exportCsv}>
            Export {view === "checkins" ? "check-ins" : "refused scans"}
          </Button>
        ) : null}
      </div>
      {loading && !data ? <Spinner /> : null}
      {err ? <Alert tone="error" testId="attendance-error">{err}</Alert> : null}

      {data && view === "checkins" ? (
        data.checkins.length === 0 ? <EmptyState icon={<ClipboardCheck />} title="No one has checked in yet">Scanned passes appear here instantly.</EmptyState> : (
          <div className="list">
            {data.checkins.map((c) => (
              <div className="list-item" key={c.id}>
                <span className="lead-ico" style={{ background: "var(--olive-100)", color: "var(--olive-700)" }}><UserCheck /></span>
                <div className="main">
                  <div className="item-top"><span className="name">{c.full_name}</span><span className="small muted num">{fmt(c.checked_in_at)}</span></div>
                  <div className="meta"><span className="ref-tag">{c.reference}</span> · {c.branch_name} · {c.batch}</div>
                  <div className="meta">By {c.scanner_name || "—"} · {c.station || "—"}</div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}

      {data && view === "attempts" ? (
        <>
          <div className="mb-12"><Alert tone="warning" testId="attendance-duplicate-count"><b>{data.duplicate_count} duplicate scan attempts.</b> Passes scanned again after entry — no second entry was recorded.</Alert></div>
          {data.attempts.length === 0 ? <EmptyState icon={<ShieldX />} title="No refused scans" /> : (
            <div className="list">
              {data.attempts.map((a) => {
                const r = RESULT_LABEL[a.result] ?? { label: a.result, tone: "error" as Tone };
                return (
                  <div className="list-item" key={a.id}>
                    <span className="lead-ico" style={r.tone === "warning" ? { background: "var(--yellow-100)", color: "var(--yellow-800)" } : { background: "var(--c-100)", color: "var(--c-700)" }}>
                      {r.tone === "warning" ? <Copy /> : <AlertTriangle />}
                    </span>
                    <div className="main">
                      <div className="item-top"><span className="name">{a.full_name || "Unknown pass"}</span><Pill label={r.label} tone={r.tone} /></div>
                      {a.reference ? <div className="meta"><span className="ref-tag">{a.reference}</span> · {a.branch_name} · {a.batch}</div> : null}
                      <div className="meta num">{fmt(a.attempted_at)} · by {a.scanner_name || "—"} · {a.station || "—"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </StaffShell>
  );
}
