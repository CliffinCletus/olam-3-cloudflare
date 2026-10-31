import { History } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { StaffShell, useStaff } from "../../components/Staff";
import { Alert, EmptyState, Spinner, fmtDateTime } from "../../components/ui";

type Entry = { id: string; action: string; target_id: string | null; timestamp: string; actor_name?: string | null; actor_email?: string | null; meta: Record<string, unknown> };

export default function AuditLog() {
  const me = useStaff(["super_admin"]);
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (me) api<Entry[]>("/audit").then(setRows).catch((e) => setErr(e.message)); }, [me]);
  return (
    <StaffShell user={me} title="Activity log" sub="The latest 200 actions: sign-ins, approvals, exports and changes.">
      {!rows && !err ? <Spinner /> : null}
      {err ? <Alert tone="error">{err}</Alert> : null}
      {rows && rows.length === 0 ? <EmptyState icon={<History />} title="Nothing yet" /> : null}
      {rows && rows.length ? (
        <div className="list">
          {rows.map((r) => (
            <div className="audit-row" key={r.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="item-top"><code>{r.action}</code><span className="small muted num">{fmtDateTime(r.timestamp)}</span></div>
                <div className="meta">
                  <b style={{ color: "var(--c-950)" }}>{r.actor_name || r.actor_email || "Public / unknown"}</b>
                  {r.target_id ? ` → ${r.target_id}` : ""}
                  {Object.keys(r.meta || {}).length ? ` · ${Object.entries(r.meta).map(([k, v]) => `${k}: ${v}`).join(", ")}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </StaffShell>
  );
}
