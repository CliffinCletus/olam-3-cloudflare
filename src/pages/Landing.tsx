import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { BgScreen } from "../components/BgScreen";
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
    <BgScreen dim={0} bare>
      <div className="landing" data-testid="landing-screen">
        <div className="top">
          <button type="button" className="staff-link" onClick={() => nav("/staff/login")} data-testid="landing-staff-login-btn">Staff Sign In</button>
        </div>
        <div className="bottom">
          <div className="ey">DELTA ACADEMY PRESENTS</div>
          <div className="title">OLAM 3.0</div>
          <div className="tag">A GRAND WEDDING</div>
          <p className="lead">Inter-branch arts festival · Register online and get your digital entry pass</p>
          <Button testId="landing-register-btn" variant={open === false ? "navy" : "primary"} onClick={() => nav("/register")}>
            {open === false ? "Registration closed" : "Register as a Student"}
          </Button>
          <button type="button" className="retrieve" onClick={() => nav("/my-pass")} data-testid="landing-retrieve-btn">
            {me ? "Open my pass / registration" : "Already registered? Retrieve my pass"}
          </button>
          <InstallApp />
        </div>
      </div>
    </BgScreen>
  );
}
