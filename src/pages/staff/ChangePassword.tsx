import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type AuthUser, clearSession, getUser, post, updateUser } from "../../api";
import { BgScreen } from "../../components/BgScreen";
import { Button, Field } from "../../components/ui";
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
    <BgScreen center>
      <div className="panel">
        <div className="eyebrow">ACCOUNT SECURITY</div>
        <h1>{forced ? "Set a new password" : "Change password"}</h1>
        <p className="sub">{forced ? "For security, please replace the temporary password before using the dashboard." : "Choose a strong password you don't use anywhere else."}</p>
        <form className="mt-24" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <input type="email" autoComplete="username" value={user?.email ?? ""} readOnly hidden />
          <Field label="Current password" htmlFor="cp-cur">
            <input id="cp-cur" className="input" type="password" autoComplete="current-password" data-testid="chpw-current-input" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" />
          </Field>
          <Field label="New password" hint="At least 10 characters, with letters and numbers" htmlFor="cp-new">
            <input id="cp-new" className="input" type="password" autoComplete="new-password" data-testid="chpw-new-input" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password" />
          </Field>
          <Field label="Confirm new password" htmlFor="cp-conf">
            <input id="cp-conf" className="input" type="password" autoComplete="new-password" data-testid="chpw-confirm-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat new password" />
          </Field>
          {err ? <p className="err" data-testid="chpw-error" role="alert" style={{ marginBottom: 12 }}>{err}</p> : null}
          {done ? <p className="ok" data-testid="chpw-success" style={{ marginBottom: 12 }}>Password updated. Taking you in…</p> : null}
          <Button type="submit" testId="chpw-submit-btn" loading={busy} disabled={done}>Save new password</Button>
          {forced ? (
            <button type="button" className="link-btn" style={{ width: "100%", marginTop: 8 }} data-testid="chpw-signout-btn" onClick={() => { clearSession(); nav("/staff/login", { replace: true }); }}>Sign out</button>
          ) : (
            <button type="button" className="link-btn" style={{ width: "100%", marginTop: 8 }} data-testid="chpw-cancel-btn" onClick={() => nav(-1)}>Cancel</button>
          )}
        </form>
      </div>
    </BgScreen>
  );
}
