import { useCallback, useEffect, useState } from "react";
import { api, downloadCsv } from "../../api";
import { BranchFilter, PageHead, canExportCsv, useBranches, useStaff } from "../../components/Staff";
import { Button, Spinner } from "../../components/ui";

type Row = { branch_id: string; branch_name: string; faculty_name: string; total: number; approved: number; pending: number; rejected: number; checked_in: number };
type Data = { rows: Row[]; total_students: number; faculty_count: number };

export default function FacultyReport() {
  const user = useStaff();
  const branches = useBranches(user?.role === "super_admin");
  const [branchId, setBranchId] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (bid: string) => {
    setLoading(true);
    try { setData(await api<Data>(`/reports/faculty${bid ? `?branch_id=${bid}` : ""}`)); setMsg(null); }
    catch (e: any) { setMsg(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (user) load(""); }, [user, load]);

  const groups: Record<string, Row[]> = {};
  (data?.rows ?? []).forEach((r) => { (groups[r.branch_name] ||= []).push(r); });

  return (
    <div className="staff-shell">
      <PageHead eyebrow="REPORTS" title="Faculty report" sub="How many students each faculty member brought, branch by branch.">
        <BranchFilter user={user} branches={branches} value={branchId} onChange={(id) => { setBranchId(id); load(id); }} testPrefix="faculty-branch" />
      </PageHead>
      <main className="staff-body">
        {loading && !data ? <Spinner /> : null}
        {data ? (
          <>
            <div className="summary-boxes">
              <div className="sum-box"><div className="v" data-testid="faculty-count">{data.faculty_count}</div><div className="l">FACULTY</div></div>
              <div className="sum-box"><div className="v" data-testid="faculty-students-total">{data.total_students}</div><div className="l">STUDENTS</div></div>
            </div>
            {canExportCsv(user) ? (
              <Button variant="navy" className="mt-12" testId="faculty-export-btn" onClick={async () => setMsg(await downloadCsv(`/export/faculty.csv${branchId ? `?branch_id=${branchId}` : ""}`, "olam-faculty-report.csv"))}>Download faculty CSV</Button>
            ) : (
              <p className="meta mt-12" data-testid="faculty-export-disabled">CSV download is not enabled for your account. Ask the admin if you need it.</p>
            )}
            {msg ? <p className="err" data-testid="faculty-msg">{msg}</p> : null}
            {data.rows.length === 0 ? <p className="empty">No registrations with a faculty name yet.</p> : null}
            {Object.entries(groups).map(([bname, rows]) => (
              <section key={bname}>
                <div className="branch-title">{bname}</div>
                {rows.map((r) => (
                  <div className="card" key={`${r.branch_id}-${r.faculty_name}`}>
                    <div className="item-top"><span className="name">{r.faculty_name}</span><span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 22, color: "var(--gold-text)" }}>{r.total}</span></div>
                    <p className="meta">
                      <span style={{ color: "var(--success-text)" }}>{r.approved} approved</span> • <span style={{ color: "var(--warning-text)" }}>{r.pending} pending</span> • <span style={{ color: "var(--error-text)" }}>{r.rejected} rejected</span> • {r.checked_in} checked in
                    </p>
                  </div>
                ))}
              </section>
            ))}
          </>
        ) : msg ? <p className="err">{msg}</p> : null}
      </main>
    </div>
  );
}
