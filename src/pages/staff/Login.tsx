import { KeyRound, LogIn, Mail, ScanLine, ShieldCheck, Users } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type Branch, type Role, api, getUser, login } from "../../api";
import { StudentScreen } from "../../components/StudentScreen";
import { Alert, Button, Chips, Field, WithIcon } from "../../components/ui";

const ROLES: { key: Role; label: string; hint: string; icon: ReactNode }[] = [
  { key: "coordinator", label: "Branch Coordinator", hint: "Approve students of your own branch", icon: <Users /> },
  { key: "scanner", label: "Gate Scanner", hint: "Scan passes at the entrance", icon: <ScanLine /> },
  { key: "super_admin", label: "Admin", hint: "Full access to all branches", icon: <ShieldCheck /> },
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
    <StudentScreen back backLabel="Home">
      <div className="sheet">
        <div className="sheet-head">
          <div className="eyebrow">Delta Academy staff</div>
          <h1>Sign in</h1>
          <p className="sub">Choose your role, then sign in with the account the admin gave you.</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <div className="field">
            <span className="field-label">Sign in as</span>
            <div className="role-grid" role="radiogroup">
              {ROLES.map((r) => (
                <button type="button" role="radio" aria-checked={role === r.key} key={r.key} className={`role-opt ${role === r.key ? "on" : ""}`}
                  onClick={() => { setRole(r.key); setErr(null); }} data-testid={`login-role-${r.key}`}>
                  <span className="ico">{r.icon}</span>
                  <span><b>{r.label}</b><span className="d">{r.hint}</span></span>
                  <span className="radio" />
                </button>
              ))}
            </div>
          </div>
          {role === "coordinator" ? (
            <Field label="Your branch">
              <Chips options={branches.map((b) => ({ id: b.id, name: b.name }))} value={branchId} onChange={(v) => { setBranchId(v); setErr(null); }} testPrefix="login-branch" />
            </Field>
          ) : null}
          <Field label="Email" htmlFor="l-email">
            <WithIcon icon={<Mail />}>
              <input id="l-email" className="input" data-testid="login-email-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoCapitalize="none" autoComplete="username" placeholder="you@deltaacademy.in" />
            </WithIcon>
          </Field>
          <Field label="Password" htmlFor="l-pw">
            <WithIcon icon={<KeyRound />}>
              <input id="l-pw" className="input" data-testid="login-password-input" value={pw} onChange={(e) => setPw(e.target.value)} type="password" autoComplete="current-password" placeholder="Your password" />
            </WithIcon>
          </Field>
          {err ? <Alert tone="error" testId="login-error">{err}</Alert> : null}
          <Button large type="submit" className="mt-16" icon={<LogIn />} testId="login-submit-btn" loading={busy}>Sign in</Button>
        </form>
      </div>
    </StudentScreen>
  );
}
