import { ArrowRight, Lock, LogIn, QrCode, Ticket, WifiOff, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { InstallApp } from "../components/InstallApp";
import { Button } from "../components/ui";
import { loadMe, loadPass } from "../lib/pass";

export default function Landing() {
  const nav = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState<boolean | null>(null);
  // A student who registered on this phone goes straight to their pass (or status) when the app opens.
  const me = loadMe();
  const goTo = me && !(location.state as { home?: boolean } | null)?.home
    ? me.reference && loadPass(me.reference) ? `/pass?ref=${encodeURIComponent(me.reference)}` : "/my-pass"
    : null;
  useEffect(() => { if (goTo) nav(goTo, { replace: true }); }, [goTo, nav]);
  useEffect(() => {
    api<{ registration_open: boolean }>("/public/settings").then((s) => setOpen(s.registration_open)).catch(() => setOpen(null));
  }, []);

  return (
    <div className="student">
      <div className="landing" data-testid="landing-screen">
        <div className="landing-top">
          <Button variant="ghost" small block={false} icon={<LogIn />} onClick={() => nav("/staff/login")} testId="landing-staff-login-btn">Staff sign in</Button>
        </div>
        <div className="landing-hero">
          <div className="eyebrow">Delta Academy presents</div>
          <h1 className="sr-only">OLAM 3.0 – A Grand Wedding</h1>
          <img className="landing-logo" src="/logo-mark.webp" alt="ഓളം 3.0 — A Grand Wedding" width={250} height={361} />
          <p className="lead">The inter-branch arts festival. Register online and get your digital entry pass.</p>
          {open === false ? <div className="closed-note"><Lock />Registration is closed</div> : null}

          <div className="landing-actions">
            <Button large testId="landing-register-btn" variant={open === false ? "secondary" : "primary"} iconRight={<ArrowRight />} onClick={() => nav("/register")}>
              {open === false ? "Registration closed" : "Register as a student"}
            </Button>
            <Button large variant="secondary" icon={<Ticket />} onClick={() => nav("/my-pass")} testId="landing-retrieve-btn">
              {me ? "Open my pass" : "I've registered — get my pass"}
            </Button>
          </div>
          <InstallApp />

          <div className="landing-feats" aria-hidden>
            <div><Zap />2-minute signup</div>
            <div><QrCode />QR entry pass</div>
            <div><WifiOff />Works offline</div>
          </div>
        </div>
        <div className="landing-foot">© Delta Academy · OLAM 3.0</div>
      </div>
    </div>
  );
}
