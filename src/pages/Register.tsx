import { Lock, Mail, Phone, ShieldCheck, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type Batch, type Branch, api, post } from "../api";
import { StudentScreen } from "../components/StudentScreen";
import { Alert, Button, Check, Chips, Field, Spinner, WithIcon } from "../components/ui";
import { saveMe } from "../lib/pass";

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
      saveMe({ email: form.email.trim(), mobile: form.mobile.trim(), reference: reg.reference });
      nav(`/confirmation?ref=${encodeURIComponent(reg.reference)}&email=${encodeURIComponent(form.email.trim())}`, { replace: true });
    } catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  }

  return (
    <StudentScreen back>
      <div className="sheet">
        <div className="sheet-head">
          <div className="eyebrow">Event registration</div>
          <h1>Your invitation awaits</h1>
          {!closed ? <p className="sub">Takes under two minutes. Your branch coordinator approves it, then your QR pass appears here.</p> : null}
        </div>

        {!settings && !error ? <Spinner /> : null}
        {closed ? (
          <div className="closed-box" data-testid="register-closed">
            <Lock />
            <div><strong>Registration closed</strong><p>{settings!.closed_message}</p></div>
          </div>
        ) : settings ? (
          <form onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
            <div className="section-label">About you</div>
            <Field label="Full name" htmlFor="r-name">
              <WithIcon icon={<User />}>
                <input id="r-name" className="input" data-testid="register-name-input" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="As it should appear on your pass" autoComplete="name" maxLength={120} />
              </WithIcon>
            </Field>
            <Field label="Mobile number" htmlFor="r-mobile" hint="One registration per mobile number.">
              <WithIcon icon={<Phone />}>
                <input id="r-mobile" className="input" data-testid="register-mobile-input" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} type="tel" inputMode="tel" placeholder="+91 98765 43210" autoComplete="tel" maxLength={20} />
              </WithIcon>
            </Field>
            <Field label="Email address" htmlFor="r-email" hint="Your email and mobile number open your pass on any phone.">
              <WithIcon icon={<Mail />}>
                <input id="r-email" className="input" data-testid="register-email-input" value={form.email} onChange={(e) => set("email", e.target.value)} type="email" inputMode="email" autoCapitalize="none" placeholder="you@example.com" autoComplete="email" />
              </WithIcon>
            </Field>

            <div className="section-label">Your academy</div>
            <Field label="Branch">
              <Chips options={branches.map((b) => ({ id: b.id, name: b.name }))} value={form.branch_id} onChange={(v) => set("branch_id", v)} testPrefix="register-branch" />
            </Field>
            <Field label="Batch">
              <Chips options={batches.map((b) => ({ id: b.name, name: b.name }))} value={form.batch} onChange={(v) => set("batch", v)} />
            </Field>
            <div className="row wrap" style={{ gap: "0 12px", alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 140px" }}>
                <Field label="Batch no." htmlFor="r-bno">
                  <input id="r-bno" className="input" data-testid="register-batchno-input" value={form.batch_no} onChange={(e) => set("batch_no", e.target.value)} placeholder="e.g. 12" autoCapitalize="characters" maxLength={30} />
                </Field>
              </div>
              <div style={{ flex: "2 1 200px" }}>
                <Field label="Faculty name" htmlFor="r-fac">
                  <input id="r-fac" className="input" data-testid="register-faculty-input" value={form.faculty_name} onChange={(e) => set("faculty_name", e.target.value)} placeholder="Your teacher's name" autoCapitalize="words" maxLength={120} />
                </Field>
              </div>
            </div>

            <div className="section-label">Confirm</div>
            <Check on={form.confirm} onClick={() => set("confirm", !form.confirm)} testId="register-confirm-check">
              I confirm the information above is accurate and I am a current Delta Academy student.
            </Check>
            {settings.privacy_notice ? (
              <div className="privacy" data-testid="register-privacy-notice">
                <div className="t"><ShieldCheck />Privacy notice</div>
                <p>{settings.privacy_notice}</p>
              </div>
            ) : null}
            <Check on={form.privacy_accepted} onClick={() => set("privacy_accepted", !form.privacy_accepted)} testId="register-privacy-check">
              I have read and accept the privacy notice.
            </Check>
            <button type="submit" hidden />
          </form>
        ) : null}
        {error && !settings ? <Alert tone="error">{error}</Alert> : null}
      </div>
      {settings && !closed ? (
        <div className="cta-bar" style={{ margin: "16px -16px calc(-32px - var(--safe-bottom))" }}>
          {error ? <Alert tone="error" testId="register-error">{error}</Alert> : null}
          <Button large testId="register-submit-btn" onClick={submit} loading={submitting}>Submit registration</Button>
        </div>
      ) : null}
    </StudentScreen>
  );
}
