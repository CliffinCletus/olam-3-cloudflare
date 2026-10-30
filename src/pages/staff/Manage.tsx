import { useCallback, useEffect, useState } from "react";
import { type AuthUser, type Branch, type Role, api, patch, post } from "../../api";
import { PageHead, useStaff } from "../../components/Staff";
import { Button, Field, Modal, Pill, Toggle } from "../../components/ui";

type Staff = AuthUser & { active: boolean };
const ROLE_TONE = { super_admin: "info", coordinator: "success", scanner: "muted" } as const;
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
    <div className="staff-shell">
      <PageHead eyebrow="STAFF MANAGEMENT" title="Accounts" sub="Coordinators approve their own branch; scanners only scan at the gate." />
      <main className="staff-body">
        <Button onClick={() => { setErr(null); setShowAdd(true); }} testId="staff-add-btn">+ Add Staff Account</Button>
        {msg ? <div className={`notice ${msg.ok ? "" : "bad"}`}>{msg.text}</div> : null}
        <div className="reg-grid">
          {staff.map((s) => {
            const branch = branches.find((b) => b.id === s.branch_id);
            return (
              <div className="card" key={s.id} data-testid={`staff-card-${s.id}`}>
                <div className="item-top">
                  <span className="name">{s.name || s.email}</span>
                  <Pill label={s.role.replace("_", " ")} tone={ROLE_TONE[s.role]} />
                </div>
                <p className="meta">{s.email}</p>
                {branch ? <p className="meta">Branch: {branch.name}</p> : null}
                <p className="meta" style={{ color: s.active ? "var(--success-text)" : "var(--error-text)" }}>{s.active ? "Active" : "Inactive — cannot sign in"}{s.must_change_password ? " • must set a new password" : ""}</p>
                {s.role === "coordinator" ? (
                  <div className="mt-8" style={{ border: `1px solid ${s.can_export ? "var(--success)" : "var(--border)"}`, borderRadius: 12, padding: "4px 12px" }}>
                    <Toggle on={!!s.can_export} onClick={() => update(s, { can_export: !s.can_export })} title="CSV download" sub={s.can_export ? "Allowed — can download their branch list" : "Not allowed"} testId={`staff-csv-toggle-${s.id}`} />
                  </div>
                ) : null}
                {s.id !== me?.id ? (
                  <div className="actions-row">
                    <button type="button" className={`chip-btn ${s.active ? "danger" : "success"}`} onClick={() => update(s, { active: !s.active }, `${s.name || s.email} ${s.active ? "deactivated" : "reactivated"}.`)} data-testid={`staff-active-toggle-${s.id}`}>
                      {s.active ? "Deactivate" : "Reactivate"}
                    </button>
                    <button type="button" className="chip-btn" onClick={() => { setResetFor(s); setResetPw(""); }} data-testid={`staff-reset-btn-${s.id}`}>Reset password</button>
                  </div>
                ) : <p className="meta mt-8">This is you.</p>}
              </div>
            );
          })}
        </div>
      </main>

      <Modal open={showAdd} onClose={() => setShowAdd(false)}>
        <h2>Add staff</h2>
        <form className="mt-12" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <Field label="Name" htmlFor="st-name"><input id="st-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="staff-name-input" /></Field>
          <Field label="Email" htmlFor="st-email"><input id="st-email" className="input" type="email" autoCapitalize="none" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="staff-email-input" /></Field>
          <Field label="Temporary password (min 8)" htmlFor="st-pw" hint="They'll be asked to choose their own at first sign-in.">
            <input id="st-pw" className="input" type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="staff-password-input" />
          </Field>
          <Field label="Role">
            <div className="chips">
              {(["super_admin", "coordinator", "scanner"] as const).map((r) => (
                <button type="button" key={r} className={`chip ${form.role === r ? "on" : ""}`} onClick={() => setForm({ ...form, role: r })} data-testid={`staff-role-${r}`}>{r.replace("_", " ")}</button>
              ))}
            </div>
          </Field>
          {form.role === "coordinator" ? (
            <Field label="Assigned branch">
              <div className="chips">
                {branches.map((b) => (
                  <button type="button" key={b.id} className={`chip ${form.branch_id === b.id ? "on" : ""}`} onClick={() => setForm({ ...form, branch_id: b.id })} data-testid={`staff-branch-${b.id}`}>{b.name}</button>
                ))}
              </div>
            </Field>
          ) : null}
          {err ? <p className="err" style={{ marginBottom: 12 }}>{err}</p> : null}
          <div className="row">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" loading={busy} testId="staff-save-btn">Create</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!resetFor} onClose={() => setResetFor(null)}>
        <h2>Reset password</h2>
        <p className="sub" style={{ marginBottom: 12 }}>Set a temporary password for {resetFor?.name || resetFor?.email}. They must change it at next sign-in.</p>
        <Field label="Temporary password (min 8)" htmlFor="rs-pw"><input id="rs-pw" className="input" type="text" autoComplete="off" value={resetPw} onChange={(e) => setResetPw(e.target.value)} data-testid="staff-reset-input" /></Field>
        <div className="row">
          <Button variant="ghost" onClick={() => setResetFor(null)}>Cancel</Button>
          <Button disabled={resetPw.length < 8} testId="staff-reset-confirm" onClick={async () => { const s = resetFor!; setResetFor(null); await update(s, { password: resetPw }, `Temporary password set for ${s.name || s.email}.`); }}>Set password</Button>
        </div>
      </Modal>
    </div>
  );
}
