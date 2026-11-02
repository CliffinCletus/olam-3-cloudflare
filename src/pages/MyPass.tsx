import { Clock, Mail, Phone, RefreshCw, Search, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type EventInfo, type Registration, post } from "../api";
import { PushOptIn } from "../components/PushOptIn";
import { StudentScreen } from "../components/StudentScreen";
import { Alert, Button, Field, Pill, Spinner, WithIcon, statusTone } from "../components/ui";
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
      // Any failure except "not found" (offline, busy, server error) falls back to the pass saved on this phone.
      if (err.status !== 404 && err.status !== 422 && ref && loadPass(ref)) { nav(`/pass?ref=${encodeURIComponent(ref)}`, { replace: true }); return; }
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
    <StudentScreen back>
      {auto ? <Spinner /> : null}
      {!auto && !reg ? (
        <div className="sheet">
          <div className="sheet-head">
            <div className="eyebrow">Your invitation</div>
            <h1>Find my pass</h1>
            <p className="sub">Enter the email and mobile number you registered with.</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); lookup(); }} noValidate>
            <Field label="Email" htmlFor="mp-email">
              <WithIcon icon={<Mail />}>
                <input id="mp-email" className="input" data-testid="status-email-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" />
              </WithIcon>
            </Field>
            <Field label="Mobile number" htmlFor="mp-mobile">
              <WithIcon icon={<Phone />}>
                <input id="mp-mobile" className="input" data-testid="status-mobile-input" value={mobile} onChange={(e) => setMobile(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" maxLength={20} />
              </WithIcon>
            </Field>
            {error ? <Alert tone="error" testId="status-error">{error}</Alert> : null}
            <Button large type="submit" className="mt-16" icon={<Search />} testId="status-lookup-btn" loading={loading}>Find my registration</Button>
          </form>
        </div>
      ) : null}

      {reg ? (
        <>
          <div className="sheet" data-testid="status-card">
            <div className="row between">
              <div className="eyebrow">Registration status</div>
              <Pill label={reg.status} tone={statusTone(reg.status)} />
            </div>
            <h1 className="mt-8">{reg.full_name}</h1>
            <dl className="kv">
              <div><dt>Branch</dt><dd>{reg.branch_name}</dd></div>
              <div><dt>Batch</dt><dd>{reg.batch}{reg.batch_no ? ` · No. ${reg.batch_no}` : ""}</dd></div>
              {reg.faculty_name ? <div><dt>Faculty</dt><dd>{reg.faculty_name}</dd></div> : null}
              <div><dt>Reference</dt><dd>{reg.reference}</dd></div>
            </dl>
            {reg.status === "pending" ? (
              <div className="status-banner warning"><Clock /><div><strong>Waiting for approval</strong>Your branch coordinator is reviewing your details. Your pass appears here as soon as you're approved.</div></div>
            ) : null}
            {reg.status === "rejected" ? (
              <div className="status-banner error"><XCircle /><div><strong>Not approved</strong>{reg.rejection_reason ? `Reason: ${reg.rejection_reason}` : "Please contact your branch coordinator."}</div></div>
            ) : null}
            <Button className="mt-16" variant="secondary" icon={<RefreshCw />} loading={loading} onClick={() => lookup()} testId="status-refresh-btn">Check again</Button>
          </div>
          {reg.status !== "rejected" ? <PushOptIn me={me} /> : null}
          <div className="pass-links mt-8">
            <button type="button" className="link-btn muted" onClick={notMe} data-testid="status-not-me-btn">Not you? Use a different registration</button>
          </div>
        </>
      ) : null}
    </StudentScreen>
  );
}
