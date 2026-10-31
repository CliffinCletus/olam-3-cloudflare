import { useNavigate, useSearchParams } from "react-router-dom";
import { BgScreen } from "../components/BgScreen";
import { PushOptIn } from "../components/PushOptIn";
import { Button } from "../components/ui";
import { loadMe } from "../lib/pass";

export default function Confirmation() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const ref = sp.get("ref") || "";
  const email = sp.get("email") || "";
  return (
    <BgScreen center>
      <div className="panel" data-testid="confirmation-screen">
        <div className="eyebrow">REGISTRATION RECEIVED</div>
        <h1>Thank you.</h1>
        <p className="sub">
          Your invitation request is being reviewed by your branch coordinator. This phone remembers you: open this
          app again and your QR pass appears as soon as you're approved. On another phone, use “Retrieve my pass” with your
          email and mobile number.
        </p>
        <div className="card mt-24">
          <div className="label-sm">REGISTRATION REFERENCE</div>
          <div style={{ fontFamily: "var(--display)", fontSize: 30, fontWeight: 700, letterSpacing: 2, marginTop: 4 }} data-testid="confirmation-reference">{ref}</div>
          <div className="divider" />
          <div className="label-sm">EMAIL</div>
          <div style={{ marginTop: 4, overflowWrap: "anywhere" }}>{email}</div>
          <p className="meta mt-12">Quote this reference if you contact your coordinator.</p>
        </div>
        <PushOptIn me={loadMe()} />
        <div className="stack mt-24">
          <Button testId="confirmation-check-status-btn" onClick={() => nav("/my-pass", { replace: true })}>
            Check Status / Retrieve Pass
          </Button>
          <button type="button" className="link-btn" style={{ width: "100%" }} onClick={() => nav("/", { replace: true, state: { home: true } })} data-testid="confirmation-home-btn">Back to home</button>
        </div>
      </div>
    </BgScreen>
  );
}
