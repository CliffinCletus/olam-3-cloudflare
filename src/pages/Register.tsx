import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type Batch, type Branch, api, post } from "../api";
import { BgScreen } from "../components/BgScreen";
import { Button, Check, Field, Spinner } from "../components/ui";

type Settings = { registration_open: boolean; closed_message: string; privacy_notice: string };
const LABELS: Record<string, string> = { full_name: "Full Name", mobile: "Mobile Number", email: "Email", branch_id: "Branch", batch: "Batch", batch_no: "Batch No.", faculty_name: "Faculty Name" };

export default function Register() {
  const nav = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState({ full_name: "", mobile: "", email: "", branch_id: "", batch: "", batch_no: "", faculty_name: "", confirm: false, privacy_accepted: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<Branch[]>("/public/branches"), api<Batch[]>("/public/batches"), api<Settings>("/public/settings")])
      .then(([b, bt, st]) => { setBranches(b); setBatches(bt); setSettings(st); })
      .catch((e) => setError(e.message));
  }, []);

  const set = (k: keyof typeof form, v: any) => { setForm((f) => ({ ...f, [k]: v })); setError(null); };
  const closed = settings && !settings.registration_open;

  async function submit() {
    setError(null);
    const missing = Object.keys(LABELS).filter((k) => !String((form as any)[k] ?? "").trim());
    if (missing.length) { setError(`Please fill in: ${missing.map((k) => LABELS[k]).join(", ")}.`); return; }
    if (form.mobile.replace(/\D/g, "").length < 10) { setError("Please enter a valid mobile number (at least 10 digits)."); return; }
    if (!form.confirm) { setError("Please confirm your information is accurate."); return; }
    if (!form.privacy_accepted) { setError("Please read and accept the privacy notice."); return; }
    setSubmitting(true);
    try {
      const reg = await post<{ reference: string }>("/registrations", form);
      nav(`/confirmation?ref=${encodeURIComponent(reg.reference)}&email=${encodeURIComponent(form.email.trim())}`, { replace: true });
    } catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  return (
    <BgScreen>
      <div className="panel">
        <button type="button" className="back" onClick={() => nav("/")} data-testid="register-back-btn">← Back</button>
        <div className="eyebrow">EVENT REGISTRATION</div>
        <h1>Your invitation awaits</h1>
        {!closed ? <p className="sub">Takes under two minutes. Approval comes from your branch coordinator.</p> : null}

        {!settings && !error ? <Spinner /> : null}
        {closed ? (
          <div className="closed-box" data-testid="register-closed">
            <strong>Registration closed</strong>
            <p>{settings!.closed_message}</p>
          </div>
        ) : settings ? (
          <form className="mt-24" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
            <Field label="Full Name" htmlFor="r-name">
              <input id="r-name" className="input" data-testid="register-name-input" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="Enter your full name" autoComplete="name" maxLength={120} />
            </Field>
            <Field label="Mobile Number" htmlFor="r-mobile" hint="One registration per mobile number">
              <input id="r-mobile" className="input" data-testid="register-mobile-input" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} type="tel" inputMode="tel" placeholder="+91 9876543210" autoComplete="tel" maxLength={20} />
            </Field>
            <Field label="Email Address" htmlFor="r-email" hint="One registration per email. You'll need it to retrieve your pass.">
              <input id="r-email" className="input" data-testid="register-email-input" value={form.email} onChange={(e) => set("email", e.target.value)} type="email" inputMode="email" autoCapitalize="none" placeholder="you@example.com" autoComplete="email" />
            </Field>
            <Field label="Branch">
              <div className="chips">
                {branches.map((b) => (
                  <button type="button" key={b.id} className={`chip ${form.branch_id === b.id ? "on" : ""}`} onClick={() => set("branch_id", b.id)} data-testid={`register-branch-${b.id}`}>{b.name}</button>
                ))}
              </div>
            </Field>
            <Field label="Batch">
              <div className="chips">
                {batches.map((b) => (
                  <button type="button" key={b.id} className={`chip ${form.batch === b.name ? "on" : ""}`} onClick={() => set("batch", b.name)} data-testid={`register-batch-${b.id}`}>{b.name}</button>
                ))}
              </div>
            </Field>
            <Field label="Batch No." htmlFor="r-bno">
              <input id="r-bno" className="input" data-testid="register-batchno-input" value={form.batch_no} onChange={(e) => set("batch_no", e.target.value)} placeholder="Enter your batch number" autoCapitalize="characters" maxLength={30} />
            </Field>
            <Field label="Faculty Name" htmlFor="r-fac">
              <input id="r-fac" className="input" data-testid="register-faculty-input" value={form.faculty_name} onChange={(e) => set("faculty_name", e.target.value)} placeholder="Enter your faculty's name" autoCapitalize="words" maxLength={120} />
            </Field>
            <Check on={form.confirm} onClick={() => set("confirm", !form.confirm)} testId="register-confirm-check">
              I confirm the information I have provided is accurate and I am a current Delta Academy student.
            </Check>
            {settings.privacy_notice ? (
              <div className="privacy" data-testid="register-privacy-notice">
                <div className="t">PRIVACY NOTICE</div>
                <p>{settings.privacy_notice}</p>
              </div>
            ) : null}
            <Check on={form.privacy_accepted} onClick={() => set("privacy_accepted", !form.privacy_accepted)} testId="register-privacy-check">
              I have read and accept the privacy notice.
            </Check>
            <button type="submit" hidden />
          </form>
        ) : null}
        {error && !settings ? <p className="err">{error}</p> : null}
      </div>
      {settings && !closed ? (
        <div className="cta-bar">
          {error ? <p className="err" data-testid="register-error" role="alert">{error}</p> : null}
          <Button testId="register-submit-btn" onClick={submit} loading={submitting}>Submit Registration</Button>
        </div>
      ) : null}
    </BgScreen>
  );
}
