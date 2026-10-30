import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { type EventInfo, type Registration, post } from "../api";
import { BgScreen } from "../components/BgScreen";
import { Button, Field, Pill, statusTone } from "../components/ui";
import { savePass } from "../lib/pass";

type Lookup = { registration: Registration; pass_token: string | null; event: EventInfo };

export default function MyPass() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [ref, setRef] = useState(sp.get("ref") ?? "");
  const [email, setEmail] = useState(sp.get("email") ?? "");
  const [data, setData] = useState<Lookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup() {
    if (!ref.trim() || !email.trim()) { setError("Enter your reference and the email you registered with."); return; }
    setLoading(true); setError(null); setData(null);
    try {
      const r = await post<Lookup>("/registrations/lookup", { reference: ref.trim(), email: email.trim() });
      setData(r);
      if (r.pass_token) savePass({ token: r.pass_token, registration: r.registration, event: r.event });
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (sp.get("ref") && sp.get("email")) lookup(); }, []);

  const reg = data?.registration;
  return (
    <BgScreen>
      <div className="panel">
        <button type="button" className="back" onClick={() => nav("/")}>← Home</button>
        <div className="eyebrow">RETRIEVE YOUR INVITATION</div>
        <h1>My Registration</h1>
        <p className="sub">Enter the reference you received after registering and the email you used.</p>
        <form className="mt-24" onSubmit={(e) => { e.preventDefault(); lookup(); }} noValidate>
          <Field label="Registration Reference" htmlFor="mp-ref">
            <input id="mp-ref" className="input" data-testid="status-ref-input" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" placeholder="OLM-XXXXXX" />
          </Field>
          <Field label="Email" htmlFor="mp-email">
            <input id="mp-email" className="input" data-testid="status-email-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" />
          </Field>
          <Button type="submit" testId="status-lookup-btn" loading={loading}>Find my registration</Button>
          {error ? <p className="err" data-testid="status-error" role="alert">{error}</p> : null}
        </form>

        {reg ? (
          <div className="card mt-24" data-testid="status-card">
            <div className="item-top">
              <span className="label-sm">STATUS</span>
              <Pill label={reg.status} tone={statusTone(reg.status)} />
            </div>
            <div style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 700, marginTop: 8 }}>{reg.full_name}</div>
            <p className="meta">{reg.branch_name} • {reg.batch}{reg.batch_no ? ` • Batch No. ${reg.batch_no}` : ""}</p>
            {reg.faculty_name ? <p className="meta">Faculty: {reg.faculty_name}</p> : null}
            <p className="meta">Ref: {reg.reference}</p>
            {reg.status === "pending" ? <p className="meta mt-12">Your branch coordinator is reviewing your details. Please check back soon.</p> : null}
            {reg.status === "rejected" ? (
              <div className="mt-12">
                <p className="meta">Your registration was not approved.</p>
                {reg.rejection_reason ? <p className="meta">Reason: {reg.rejection_reason}</p> : null}
              </div>
            ) : null}
            {reg.status === "approved" && data?.pass_token ? (
              <Button className="mt-16" testId="status-view-pass-btn" onClick={() => nav(`/pass?ref=${encodeURIComponent(reg.reference)}`)}>
                View & download my pass (PDF)
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </BgScreen>
  );
}
