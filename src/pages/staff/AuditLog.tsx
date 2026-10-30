import { useEffect, useState } from "react";
import { api } from "../../api";
import { PageHead, useStaff } from "../../components/Staff";
import { Spinner, fmtDateTime } from "../../components/ui";

type Entry = { id: string; action: string; target_id: string | null; timestamp: string; actor_name?: string | null; actor_email?: string | null; meta: Record<string, unknown> };

export default function AuditLog() {
  const me = useStaff(["super_admin"]);
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (me) api<Entry[]>("/audit").then(setRows).catch((e) => setErr(e.message)); }, [me]);
  return (
    <div className="staff-shell">
      <PageHead eyebrow="SECURITY" title="Activity log" sub="The latest 200 actions: sign-ins, approvals, exports and changes." />
      <main className="staff-body">
        {!rows && !err ? <Spinner /> : null}
        {err ? <p className="err">{err}</p> : null}
        {rows ? (
          <div className="card">
            {rows.length === 0 ? <p className="empty">Nothing yet.</p> : null}
            {rows.map((r) => (
              <div className="audit-row" key={r.id}>
                <div className="item-top"><code>{r.action}</code><span className="small muted">{fmtDateTime(r.timestamp)}</span></div>
                <div className="meta">
                  {r.actor_name || r.actor_email || "Public / unknown"}
                  {r.target_id ? ` → ${r.target_id}` : ""}
                  {Object.keys(r.meta || {}).length ? ` · ${Object.entries(r.meta).map(([k, v]) => `${k}: ${v}`).join(", ")}` : ""}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}
