import { KeyRound, Mail, ScanLine, ShieldCheck, UserCheck, UserPlus, UserX, Users } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { type AuthUser, type Branch, type Role, api, patch, post } from "../../api";
import { StaffShell, useStaff } from "../../components/Staff";
import { Alert, Button, Chips, Field, IconButton, Modal, Pill, Toggle, WithIcon } from "../../components/ui";

type Staff = AuthUser & { active: boolean };
const ROLE_META: Record<Role, { label: string; tone: "info" | "success" | "gold"; icon: ReactNode; bg: string; fg: string }> = {
  super_admin: { label: "Admin", tone: "info", icon: <ShieldCheck />, bg: "var(--blue-100)", fg: "var(--blue-600)" },
  coordinator: { label: "Coordinator", tone: "success", icon: <Users />, bg: "var(--olive-100)", fg: "var(--olive-700)" },
  scanner: { label: "Scanner", tone: "gold", icon: <ScanLine />, bg: "var(--gold-100)", fg: "var(--gold-700)" },
};
const blank = { email: "", name: "", password: "", role: "coordinator" as Role, branch_id: "" };

export default function Manage() {
  const me = useStaff(["super_admin"]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState<Staff | null>(null);
  const [resetPw, setResetPw] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([api<Staff[]>("/staff"), api<Branch[]>("/branches")]);
      setStaff(s); setBranches(b);
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  }, []);
  useEffect(() => { if (me) refresh(); }, [me, refresh]);

  async function update(s: Staff, body: Record<string, unknown>, okText?: string) {
    setMsg(null);
    try { await patch(`/staff/${s.id}`, body); if (okText) setMsg({ ok: true, text: okText }); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); }
    refresh();
  }

  async function create() {
    setErr(null); setBusy(true);
    try {
      const body: Record<string, unknown> = { ...form };
      if (!body.branch_id) delete body.branch_id;
      await post("/staff", body);
      setShowAdd(false); setForm(blank); refresh();
      setMsg({ ok: true, text: `Account created for ${form.email}. They must change the password at first sign-in.` });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <StaffShell user={me} title="Staff accounts" sub="Coordinators approve their own branch; scanners only scan at the gate."
      actions={<Button small block={false} icon={<UserPlus />} onClick={() => { setErr(null); setShowAdd(true); }} testId="staff-add-btn">Add staff</Button>}>
      {msg ? <div className="mb-12"><Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert></div> : null}
      <div className="list">
        {staff.map((s) => {
          const branch = branches.find((b) => b.id === s.branch_id);
          const r = ROLE_META[s.role];
          return (
            <div className="list-item col" key={s.id} data-testid={`staff-card-${s.id}`}>
              <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                <span className="lead-ico" style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: r.bg, color: r.fg, flex: "0 0 38px" }}>{r.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="item-top"><span className="name">{s.name || s.email}</span><Pill label={r.label} tone={r.tone} /></div>
                  <div className="meta">{s.email}{branch ? ` · ${branch.name}` : ""}</div>
                  <div className="row wrap mt-4" style={{ gap: 6 }}>
                    <Pill label={s.active ? "Active" : "Inactive"} tone={s.active ? "success" : "muted"} />
                    {s.must_change_password ? <Pill label="Must set new password" tone="warning" /> : null}
                    {s.id === me?.id ? <Pill label="You" tone="gold" /> : null}
                  </div>
                </div>
                {s.id !== me?.id ? (
                  <div className="row" style={{ gap: 6 }}>
                    <IconButton small label={`Reset password for ${s.name || s.email}`} icon={<KeyRound />} onClick={() => { setResetFor(s); setResetPw(""); }} testId={`staff-reset-btn-${s.id}`} />
                    <IconButton small variant={s.active ? "danger" : "success"} label={s.active ? `Deactivate ${s.name || s.email}` : `Reactivate ${s.name || s.email}`} icon={s.active ? <UserX /> : <UserCheck />}
                      onClick={() => update(s, { active: !s.active }, `${s.name || s.email} ${s.active ? "deactivated" : "reactivated"}.`)} testId={`staff-active-toggle-${s.id}`} />
                  </div>
                ) : null}
              </div>
              {s.role === "coordinator" ? (
                <div style={{ paddingLeft: 50 }}>
                  <Toggle on={!!s.can_export} onClick={() => update(s, { can_export: !s.can_export })} title="CSV download" sub={s.can_export ? "Allowed — can download their branch lists" : "Not allowed"} testId={`staff-csv-toggle-${s.id}`} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)}>
        <div className="modal-ico success"><UserPlus /></div>
        <h2>Add staff account</h2>
        <form className="mt-16" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <Field label="Name" htmlFor="st-name"><input id="st-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="staff-name-input" /></Field>
          <Field label="Email" htmlFor="st-email"><WithIcon icon={<Mail />}><input id="st-email" className="input" type="email" autoCapitalize="none" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="staff-email-input" /></WithIcon></Field>
          <Field label="Temporary password" htmlFor="st-pw" hint="At least 8 characters. They choose their own at first sign-in.">
            <WithIcon icon={<KeyRound />}><input id="st-pw" className="input" type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="staff-password-input" /></WithIcon>
          </Field>
          <Field label="Role">
            <Chips options={(["coordinator", "scanner", "super_admin"] as const).map((r) => ({ id: r, name: ROLE_META[r].label }))} value={form.role} onChange={(r) => setForm({ ...form, role: r })} testPrefix="staff-role" />
          </Field>
          {form.role === "coordinator" ? (
            <Field label="Assigned branch">
              <Chips options={branches.map((b) => ({ id: b.id, name: b.name }))} value={form.branch_id} onChange={(v) => setForm({ ...form, branch_id: v })} testPrefix="staff-branch" />
            </Field>
          ) : null}
          {err ? <Alert tone="error">{err}</Alert> : null}
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" loading={busy} testId="staff-save-btn">Create</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!resetFor} onClose={() => setResetFor(null)}>
        <div className="modal-ico"><KeyRound /></div>
        <h2>Reset password</h2>
        <p className="sub" style={{ marginBottom: 14 }}>Set a temporary password for {resetFor?.name || resetFor?.email}. They must change it at next sign-in.</p>
        <Field label="Temporary password" htmlFor="rs-pw" hint="At least 8 characters."><input id="rs-pw" className="input" type="text" autoComplete="off" value={resetPw} onChange={(e) => setResetPw(e.target.value)} data-testid="staff-reset-input" /></Field>
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setResetFor(null)}>Cancel</Button>
          <Button disabled={resetPw.length < 8} testId="staff-reset-confirm" onClick={async () => { const s = resetFor!; setResetFor(null); await update(s, { password: resetPw }, `Temporary password set for ${s.name || s.email}.`); }}>Set password</Button>
        </div>
      </Modal>
    </StaffShell>
  );
}
