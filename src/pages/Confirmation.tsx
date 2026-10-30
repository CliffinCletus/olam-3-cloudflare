import { useNavigate, useSearchParams } from "react-router-dom";
import { BgScreen } from "../components/BgScreen";
import { Button } from "../components/ui";

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
          Your invitation request is being reviewed by your branch coordinator. Once you're approved, come back to
          “Retrieve my pass” with this reference and your email to view and download your QR pass as a PDF.
        </p>
        <div className="card mt-24">
          <div className="label-sm">REGISTRATION REFERENCE</div>
          <div style={{ fontFamily: "var(--display)", fontSize: 30, fontWeight: 700, letterSpacing: 2, marginTop: 4 }} data-testid="confirmation-reference">{ref}</div>
          <div className="divider" />
          <div className="label-sm">EMAIL</div>
          <div style={{ marginTop: 4, overflowWrap: "anywhere" }}>{email}</div>
          <p className="meta mt-12">Keep this reference safe — take a screenshot. You will need it to retrieve your pass.</p>
        </div>
        <div className="stack mt-24">
          <Button testId="confirmation-check-status-btn" onClick={() => nav(`/my-pass?ref=${encodeURIComponent(ref)}&email=${encodeURIComponent(email)}`, { replace: true })}>
            Check Status / Retrieve Pass
          </Button>
          <button type="button" className="link-btn" style={{ width: "100%" }} onClick={() => nav("/", { replace: true })} data-testid="confirmation-home-btn">Back to home</button>
        </div>
      </div>
    </BgScreen>
  );
}
