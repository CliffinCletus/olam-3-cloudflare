import { useCallback, useEffect, useRef, useState } from "react";
import { api, downloadCsv } from "../../api";
import { BranchFilter, PageHead, canExportCsv, useBranches, useStaff } from "../../components/Staff";
import { Button, Spinner } from "../../components/ui";
import { myPassLink, openWhatsApp, waNumber } from "../../lib/whatsapp";

type Student = { id: string; reference: string; full_name: string; mobile: string; email: string; batch: string; batch_no?: string; faculty_name?: string };
type Data = { total: number; branches: { branch_name: string; count: number; students: Student[] }[] };

export default function Absent() {
  const user = useStaff();
  const branches = useBranches(user?.role === "super_admin");
  const [branchId, setBranchId] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const latest = useRef("");

  const load = useCallback(async (bid: string) => {
    latest.current = bid;
    setLoading(true);
    try {
      const d = await api<Data>(`/reports/absent${bid ? `?branch_id=${bid}` : ""}`);
      if (latest.current !== bid) return; // a newer branch was picked meanwhile
      setData(d); setMsg(null);
    } catch (e: any) { setMsg(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (user) load(""); }, [user, load]);

  function remind(s: Student, branch: string) {
    const num = waNumber(s.mobile);
    if (!num) { setMsg(`${s.full_name}'s mobile number looks incomplete — please call instead.`); return; }
    openWhatsApp(
      `Hi ${s.full_name}, this is your OLAM 3.0 coordinator (${branch}). 🎉\n\nOLAM 3.0 – A Grand Wedding has started and we haven't seen you at the entrance yet. Please come soon and keep your QR pass ready at the gate.\n\nReference: ${s.reference}\nOpen your pass (email + mobile number): ${myPassLink()}`,
      num,
    );
  }

  const needle = q.trim().toLowerCase();
  const match = (s: Student) => !needle || [s.full_name, s.reference, s.mobile, s.batch, s.faculty_name].some((v) => v?.toLowerCase().includes(needle));

  return (
    <div className="staff-shell">
      <PageHead eyebrow="FOLLOW UP" title="Not arrived yet" sub="Approved students who haven't checked in. Tap a number to call or send a WhatsApp reminder.">
        <BranchFilter user={user} branches={branches} value={branchId} onChange={(id) => { setBranchId(id); load(id); }} testPrefix="absent-branch" />
      </PageHead>
      <main className="staff-body">
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: 8 }}><button type="button" className="chip-btn" onClick={() => load(branchId)}>↻ Refresh</button></div>
        {loading && !data ? <Spinner /> : null}
        {msg ? <p className="err" data-testid="absent-msg">{msg}</p> : null}
        {data ? (
          <>
            <div className="hero"><div className="v" data-testid="absent-total">{data.total}</div><div className="l">STUDENTS NOT ARRIVED</div></div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, reference, mobile, batch" autoCorrect="off" data-testid="absent-search-input" aria-label="Search" />
            {canExportCsv(user) ? (
              <Button variant="navy" className="mt-12" testId="absent-export-btn" onClick={async () => setMsg(await downloadCsv(`/export/absent.csv${branchId ? `?branch_id=${branchId}` : ""}`, "olam-absent-students.csv"))}>Download list (CSV)</Button>
            ) : (
              <p className="meta mt-12" data-testid="absent-export-disabled">CSV download is not enabled for your account.</p>
            )}
            {data.total === 0 ? <p className="empty" data-testid="absent-empty">Everyone approved has arrived. 🎉</p> : null}
            {data.total > 0 && needle && !data.branches.some((g) => g.students.some(match)) ? <p className="empty" data-testid="absent-no-match">No students match “{q.trim()}”.</p> : null}
            {data.branches.map((g) => {
              const list = g.students.filter(match);
              if (!list.length) return null;
              return (
                <section key={g.branch_name} data-testid={`absent-group-${g.branch_name}`}>
                  <div className="branch-title">{g.branch_name} • {needle ? `${list.length} of ${g.count}` : g.count}</div>
                  {list.map((s) => (
                    <div className="card" key={s.id} data-testid={`absent-student-${s.reference}`}>
                      <div className="item-top"><span className="name">{s.full_name}</span><span className="ref-tag">{s.reference}</span></div>
                      <p className="meta">{s.batch}{s.batch_no ? ` • No. ${s.batch_no}` : ""}{s.faculty_name ? ` • ${s.faculty_name}` : ""}</p>
                      <div className="actions-row">
                        <a className="call-btn" href={`tel:${s.mobile}`} data-testid={`absent-call-${s.reference}`}>📞 {s.mobile}</a>
                        <button type="button" className="wa-btn" onClick={() => remind(s, g.branch_name)} data-testid={`absent-wa-${s.reference}`}>WhatsApp reminder</button>
                      </div>
                    </div>
                  ))}
                </section>
              );
            })}
          </>
        ) : null}
      </main>
    </div>
  );
}
