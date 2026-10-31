import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type AuthUser, clearSession, getUser, post, updateUser } from "../../api";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { StudentScreen } from "../../components/StudentScreen";
import { Alert, Button, Field, WithIcon } from "../../components/ui";
import { homeFor } from "./Login";

export default function ChangePassword() {
  const nav = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u) { nav("/staff/login", { replace: true }); return; }
    setUser(u);
  }, [nav]);

  const forced = !!user?.must_change_password;
  const strong = next.length >= 10 && /[A-Za-z]/.test(next) && /\d/.test(next);

  async function submit() {
    setErr(null);
    if (!strong) { setErr("Use at least 10 characters with letters and numbers."); return; }
    if (next !== confirm) { setErr("The new passwords do not match."); return; }
    setBusy(true);
    try {
      await post("/auth/change-password", { current_password: current, new_password: next });
      updateUser({ must_change_password: false });
      setDone(true);
      setTimeout(() => nav(homeFor(user!.role), { replace: true }), 900);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <StudentScreen>
      <div className="sheet">
        <div className="hero-icon warning"><ShieldCheck /></div>
        <div className="eyebrow">Account security</div>
        <h1>{forced ? "Set a new password" : "Change password"}</h1>
        <p className="sub">{forced ? "For security, please replace the temporary password before using the dashboard." : "Choose a strong password you don't use anywhere else."}</p>
        <form className="mt-24" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <input type="email" autoComplete="username" value={user?.email ?? ""} readOnly hidden />
          <Field label="Current password" htmlFor="cp-cur">
            <WithIcon icon={<KeyRound />}><input id="cp-cur" className="input" type="password" autoComplete="current-password" data-testid="chpw-current-input" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" /></WithIcon>
          </Field>
          <Field label="New password" hint="At least 10 characters, with letters and numbers" htmlFor="cp-new">
            <WithIcon icon={<KeyRound />}><input id="cp-new" className="input" type="password" autoComplete="new-password" data-testid="chpw-new-input" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password" /></WithIcon>
          </Field>
          <Field label="Confirm new password" htmlFor="cp-conf">
            <WithIcon icon={<KeyRound />}><input id="cp-conf" className="input" type="password" autoComplete="new-password" data-testid="chpw-confirm-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat new password" /></WithIcon>
          </Field>
          {err ? <Alert tone="error" testId="chpw-error">{err}</Alert> : null}
          {done ? <Alert tone="success" testId="chpw-success">Password updated. Taking you in…</Alert> : null}
          <Button large className="mt-16" type="submit" testId="chpw-submit-btn" loading={busy} disabled={done}>Save new password</Button>
          {forced ? (
            <Button variant="ghost" className="mt-8" icon={<LogOut />} testId="chpw-signout-btn" onClick={() => { clearSession(); nav("/staff/login", { replace: true }); }}>Sign out</Button>
          ) : (
            <Button variant="ghost" className="mt-8" testId="chpw-cancel-btn" onClick={() => nav(-1)}>Cancel</Button>
          )}
        </form>
      </div>
    </StudentScreen>
  );
}
