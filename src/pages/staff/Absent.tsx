import { useCallback, useEffect, useRef, useState } from "react";
import { api, downloadCsv } from "../../api";
import { Download, MessageCircle, PartyPopper, Phone, RefreshCw, Search, UserX } from "lucide-react";
import { BranchFilter, StaffShell, canExportCsv, useBranches, useStaff } from "../../components/Staff";
import { Alert, Button, EmptyState, IconButton, SearchInput, Spinner } from "../../components/ui";
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
    <StaffShell user={user} title="Not arrived yet" sub="Approved students who haven't checked in. Call them or send a WhatsApp reminder."
      actions={<IconButton label="Refresh" icon={<RefreshCw />} loading={loading} onClick={() => load(branchId)} />}>
      {loading && !data ? <Spinner /> : null}
      {msg ? <div className="mb-12"><Alert tone="error" testId="absent-msg">{msg}</Alert></div> : null}
      {data ? (
        <>
          <div className="hero-card">
            <div><div className="l">Students not arrived</div><div className="v" data-testid="absent-total">{data.total}</div></div>
            <UserX style={{ width: 44, height: 44, opacity: 0.35 }} />
          </div>
          <div className="toolbar">
            <SearchInput value={q} onChange={setQ} placeholder="Search name, reference, mobile, batch" testId="absent-search-input" />
            <BranchFilter user={user} branches={branches} value={branchId} onChange={(id) => { setBranchId(id); load(id); }} testPrefix="absent-branch" />
            {canExportCsv(user) ? (
              <Button variant="secondary" small block={false} icon={<Download />} testId="absent-export-btn" onClick={async () => setMsg(await downloadCsv(`/export/absent.csv${branchId ? `?branch_id=${branchId}` : ""}`, "olam-absent-students.csv"))}>Export list</Button>
            ) : (
              <span className="small muted" data-testid="absent-export-disabled">CSV download is not enabled for your account.</span>
            )}
          </div>
          {data.total === 0 ? <EmptyState icon={<PartyPopper />} title="Everyone approved has arrived" testId="absent-empty">🎉</EmptyState> : null}
          {data.total > 0 && needle && !data.branches.some((g) => g.students.some(match)) ? <EmptyState icon={<Search />} title={`No students match “${q.trim()}”`} testId="absent-no-match" /> : null}
          {data.branches.map((g) => {
            const list = g.students.filter(match);
            if (!list.length) return null;
            return (
              <section key={g.branch_name} data-testid={`absent-group-${g.branch_name}`}>
                <div className="group-title">{g.branch_name}<span className="count num">{needle ? `${list.length} of ${g.count}` : g.count}</span></div>
                <div className="list">
                  {list.map((s) => (
                    <div className="list-item col absent-item" key={s.id} data-testid={`absent-student-${s.reference}`}>
                      <div>
                        <div className="item-top"><span className="name">{s.full_name}</span><span className="ref-tag">{s.reference}</span></div>
                        <div className="meta">{s.batch}{s.batch_no ? ` · No. ${s.batch_no}` : ""}{s.faculty_name ? ` · ${s.faculty_name}` : ""}</div>
                      </div>
                      <div className="row wrap">
                        <a className="call-btn" href={`tel:${s.mobile}`} data-testid={`absent-call-${s.reference}`}><Phone />{s.mobile}</a>
                        <button type="button" className="wa-btn" onClick={() => remind(s, g.branch_name)} data-testid={`absent-wa-${s.reference}`}><MessageCircle />WhatsApp reminder</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </>
      ) : null}
    </StaffShell>
  );
}
