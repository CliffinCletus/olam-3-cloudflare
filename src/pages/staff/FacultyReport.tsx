import { Download, GraduationCap, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, downloadCsv } from "../../api";
import { BranchFilter, StaffShell, canExportCsv, useBranches, useStaff } from "../../components/Staff";
import { Alert, Button, EmptyState, Pill, Spinner, StatCard } from "../../components/ui";

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
    <StaffShell user={user} title="Faculty report" sub="How many students each faculty member brought, branch by branch."
      actions={canExportCsv(user) ? <Button variant="secondary" small block={false} icon={<Download />} testId="faculty-export-btn" onClick={async () => setMsg(await downloadCsv(`/export/faculty.csv${branchId ? `?branch_id=${branchId}` : ""}`, "olam-faculty-report.csv"))}>Export CSV</Button> : undefined}>
      <div className="toolbar"><BranchFilter user={user} branches={branches} value={branchId} onChange={(id) => { setBranchId(id); load(id); }} testPrefix="faculty-branch" /></div>
      {loading && !data ? <Spinner /> : null}
      {msg ? <div className="mb-12"><Alert tone="error" testId="faculty-msg">{msg}</Alert></div> : null}
      {!canExportCsv(user) ? <p className="meta mb-12" data-testid="faculty-export-disabled">CSV download is not enabled for your account. Ask the admin if you need it.</p> : null}
      {data ? (
        <>
          <div className="summary-boxes">
            <StatCard label="Faculty" value={<span data-testid="faculty-count">{data.faculty_count}</span>} icon={<GraduationCap />} tone="gold" />
            <StatCard label="Students" value={<span data-testid="faculty-students-total">{data.total_students}</span>} icon={<Users />} tone="crimson" />
          </div>
          {data.rows.length === 0 ? <EmptyState icon={<GraduationCap />} title="No faculty names yet">They appear as students register.</EmptyState> : null}
          {Object.entries(groups).map(([bname, rows]) => (
            <section key={bname}>
              <div className="group-title">{bname}<span className="count">{rows.length} faculty</span></div>
              <div className="list">
                {rows.map((r) => (
                  <div className="list-item" key={`${r.branch_id}-${r.faculty_name}`}>
                    <span className="lead-ico" style={{ background: "var(--gold-100)", color: "var(--gold-700)" }}><GraduationCap /></span>
                    <div className="main">
                      <div className="name">{r.faculty_name}</div>
                      <div className="row wrap mt-4" style={{ gap: 6 }}>
                        <Pill label={`${r.approved} approved`} tone="success" />
                        {r.pending ? <Pill label={`${r.pending} pending`} tone="warning" /> : null}
                        {r.rejected ? <Pill label={`${r.rejected} rejected`} tone="error" /> : null}
                        <Pill label={`${r.checked_in} in`} tone="info" />
                      </div>
                    </div>
                    <div className="big-num" style={{ fontSize: 30 }}>{r.total}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      ) : null}
    </StaffShell>
  );
}
