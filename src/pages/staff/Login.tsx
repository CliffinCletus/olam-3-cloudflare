import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type Branch, type Role, api, getUser, login } from "../../api";
import { BgScreen } from "../../components/BgScreen";
import { Button, Field } from "../../components/ui";

const ROLES: { key: Role; label: string; hint: string }[] = [
  { key: "coordinator", label: "Branch Coordinator", hint: "Approve students of your own branch" },
  { key: "scanner", label: "Gate Scanner", hint: "Scan passes at the entrance" },
  { key: "super_admin", label: "Admin", hint: "Full access to all branches" },
];

export const homeFor = (role: Role) => (role === "scanner" ? "/staff/scanner" : "/staff/dashboard");

export default function Login() {
  const nav = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const u = getUser();
    if (u && !u.must_change_password) { nav(homeFor(u.role), { replace: true }); return; }
    api<Branch[]>("/public/branches").then(setBranches).catch(() => {});
  }, [nav]);

  async function submit() {
    setErr(null);
    if (!role) { setErr("Please choose how you are signing in."); return; }
    if (role === "coordinator" && !branchId) { setErr("Please choose your branch."); return; }
    if (!email.trim() || !pw) { setErr("Please enter your email and password."); return; }
    setBusy(true);
    try {
      const u = await login(email.trim(), pw, role, role === "coordinator" ? branchId : undefined);
      nav(u.must_change_password ? "/staff/change-password" : homeFor(u.role), { replace: true });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <BgScreen center>
      <div className="panel">
        <button type="button" className="back" onClick={() => nav("/")} data-testid="login-home-btn">← Home</button>
        <div className="eyebrow mt-8">DELTA ACADEMY STAFF</div>
        <h1>Sign in</h1>
        <p className="sub">Choose your role. Coordinators can only approve students of their own branch.</p>
        <form className="mt-24" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <div className="field">
            <span className="field-label">Sign in as</span>
            <div className="stack" style={{ display: "grid", gap: 8 }}>
              {ROLES.map((r) => (
                <button type="button" key={r.key} onClick={() => { setRole(r.key); setErr(null); }} data-testid={`login-role-${r.key}`}
                  className="card" style={{ display: "flex", gap: 12, alignItems: "center", textAlign: "left", cursor: "pointer", marginTop: 0, borderColor: role === r.key ? "var(--gold)" : undefined, background: role === r.key ? "#fffaf0" : undefined }}>
                  <span style={{ width: 22, height: 22, borderRadius: 11, border: "2px solid var(--gold)", display: "grid", placeItems: "center", flex: "0 0 22px" }}>
                    {role === r.key ? <span style={{ width: 10, height: 10, borderRadius: 5, background: "var(--gold)" }} /> : null}
                  </span>
                  <span>
                    <span className="name" style={{ display: "block" }}>{r.label}</span>
                    <span className="meta">{r.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          {role === "coordinator" ? (
            <Field label="Your branch">
              <div className="chips">
                {branches.map((b) => (
                  <button type="button" key={b.id} className={`chip ${branchId === b.id ? "on" : ""}`} onClick={() => { setBranchId(b.id); setErr(null); }} data-testid={`login-branch-${b.id}`}>{b.name}</button>
                ))}
              </div>
            </Field>
          ) : null}
          <Field label="Email" htmlFor="l-email">
            <input id="l-email" className="input" data-testid="login-email-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoCapitalize="none" autoComplete="username" placeholder="you@olam.delta" />
          </Field>
          <Field label="Password" htmlFor="l-pw">
            <input id="l-pw" className="input" data-testid="login-password-input" value={pw} onChange={(e) => setPw(e.target.value)} type="password" autoComplete="current-password" placeholder="Your password" />
          </Field>
          {err ? <p className="err" data-testid="login-error" role="alert" style={{ marginBottom: 12 }}>{err}</p> : null}
          <Button type="submit" testId="login-submit-btn" loading={busy}>Sign in</Button>
        </form>
      </div>
    </BgScreen>
  );
}
