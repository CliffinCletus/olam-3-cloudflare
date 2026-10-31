import { ArrowRight, Check, CheckCircle2, Copy } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PushOptIn } from "../components/PushOptIn";
import { StudentScreen } from "../components/StudentScreen";
import { Button, IconButton } from "../components/ui";
import { loadMe } from "../lib/pass";

export default function Confirmation() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const ref = sp.get("ref") || "";
  const email = sp.get("email") || "";
  const [copied, setCopied] = useState(false);

  async function copy() {
    try { await navigator.clipboard.writeText(ref); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  }

  return (
    <StudentScreen>
      <div className="sheet" data-testid="confirmation-screen">
        <div className="hero-icon success"><CheckCircle2 /></div>
        <div className="eyebrow">Registration received</div>
        <h1>Thank you!</h1>
        <p className="sub">
          Your branch coordinator will review your details. This phone remembers you — open the app again and your QR pass appears
          as soon as you're approved. On another phone, use “Get my pass” with your email and mobile number.
        </p>
        <div className="ref-box mt-24">
          <div className="grow">
            <div className="eyebrow">Your reference</div>
            <div className="v" data-testid="confirmation-reference">{ref}</div>
          </div>
          <IconButton label={copied ? "Copied" : "Copy reference"} icon={copied ? <Check /> : <Copy />} variant={copied ? "success" : ""} onClick={copy} />
        </div>
        {email ? <p className="meta mt-8">Registered with {email}</p> : null}
        <div className="stack mt-24">
          <Button large iconRight={<ArrowRight />} testId="confirmation-check-status-btn" onClick={() => nav("/my-pass", { replace: true })}>Check my status</Button>
          <Button variant="ghost" onClick={() => nav("/", { replace: true, state: { home: true } })} testId="confirmation-home-btn">Back to home</Button>
        </div>
      </div>
      <PushOptIn me={loadMe()} />
    </StudentScreen>
  );
}
