import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type EventInfo, type Registration, post } from "../api";
import { BgScreen } from "../components/BgScreen";
import { PushOptIn } from "../components/PushOptIn";
import { Button, Field, Pill, Spinner, statusTone } from "../components/ui";
import { type Me, forgetMe, loadMe, loadPass, saveMe, savePass } from "../lib/pass";

type Lookup = { registration: Registration; pass_token: string | null; event: EventInfo };

export default function MyPass() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const saved = loadMe();
  const [email, setEmail] = useState(saved?.email ?? sp.get("email") ?? "");
  const [mobile, setMobile] = useState(saved?.mobile ?? "");
  const [me, setMe] = useState<Me | null>(saved);
  const [data, setData] = useState<Lookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(!!saved); // reopening the app: check quietly, no form flash
  const [error, setError] = useState<string | null>(null);

  async function lookup(e = email, m = mobile) {
    if (!e.trim() || !m.trim()) { setError("Enter the email and mobile number you registered with."); setAuto(false); return; }
    if (m.replace(/\D/g, "").length < 10) { setError("Enter your full mobile number (at least 10 digits)."); setAuto(false); return; }
    setLoading(true); setError(null); setData(null);
    try {
      const r = await post<Lookup>("/registrations/lookup", { email: e.trim(), mobile: m.trim() });
      const who = { email: e.trim(), mobile: m.trim(), reference: r.registration.reference };
      saveMe(who); setMe(who);
      if (r.pass_token) {
        savePass({ token: r.pass_token, registration: r.registration, event: r.event });
        nav(`/pass?ref=${encodeURIComponent(r.registration.reference)}`, { replace: true });
        return;
      }
      setData(r);
    } catch (err: any) {
      const ref = loadMe()?.reference;
      if (err.status === 0 && ref && loadPass(ref)) { nav(`/pass?ref=${encodeURIComponent(ref)}`, { replace: true }); return; }
      if (err.status === 404 && saved) { forgetMe(); setMe(null); }
      setError(err.message);
    } finally { setLoading(false); setAuto(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (saved) lookup(saved.email, saved.mobile); }, []);

  function notMe() {
    forgetMe();
    setMe(null); setData(null); setEmail(""); setMobile(""); setError(null);
  }

  const reg = data?.registration;
  return (
    <BgScreen>
      <div className="panel">
        <button type="button" className="back" onClick={() => nav("/", { state: { home: true } })}>← Home</button>
        <div className="eyebrow">RETRIEVE YOUR INVITATION</div>
        <h1>My Registration</h1>
        {auto ? <Spinner /> : null}
        {!auto && !reg ? (
          <>
            <p className="sub">Enter the email and mobile number you registered with.</p>
            <form className="mt-24" onSubmit={(e) => { e.preventDefault(); lookup(); }} noValidate>
              <Field label="Email" htmlFor="mp-email">
                <input id="mp-email" className="input" data-testid="status-email-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" />
              </Field>
              <Field label="Mobile Number" htmlFor="mp-mobile">
                <input id="mp-mobile" className="input" data-testid="status-mobile-input" value={mobile} onChange={(e) => setMobile(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 9876543210" maxLength={20} />
              </Field>
              <Button type="submit" testId="status-lookup-btn" loading={loading}>Find my registration</Button>
              {error ? <p className="err" data-testid="status-error" role="alert">{error}</p> : null}
            </form>
          </>
        ) : null}

        {reg ? (
          <>
            <div className="card mt-24" data-testid="status-card">
              <div className="item-top">
                <span className="label-sm">STATUS</span>
                <Pill label={reg.status} tone={statusTone(reg.status)} />
              </div>
              <div style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 700, marginTop: 8 }}>{reg.full_name}</div>
              <p className="meta">{reg.branch_name} • {reg.batch}{reg.batch_no ? ` • Batch No. ${reg.batch_no}` : ""}</p>
              {reg.faculty_name ? <p className="meta">Faculty: {reg.faculty_name}</p> : null}
              <p className="meta">Ref: {reg.reference}</p>
              {reg.status === "pending" ? <p className="meta mt-12">Your branch coordinator is reviewing your details. Open this app again later — your pass appears here as soon as you're approved.</p> : null}
              {reg.status === "rejected" ? (
                <div className="mt-12">
                  <p className="meta">Your registration was not approved.</p>
                  {reg.rejection_reason ? <p className="meta">Reason: {reg.rejection_reason}</p> : null}
                </div>
              ) : null}
              <Button className="mt-16" variant="navy" loading={loading} onClick={() => lookup()} testId="status-refresh-btn">Check again</Button>
            </div>
            {reg.status !== "rejected" ? <PushOptIn me={me} /> : null}
            <button type="button" className="link-btn mt-16" style={{ width: "100%" }} onClick={notMe} data-testid="status-not-me-btn">Not you? Use a different registration</button>
          </>
        ) : null}
      </div>
    </BgScreen>
  );
}
