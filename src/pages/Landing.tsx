import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { BgScreen } from "../components/BgScreen";
import { InstallApp } from "../components/InstallApp";
import { Button } from "../components/ui";

export default function Landing() {
  const nav = useNavigate();
  const [open, setOpen] = useState<boolean | null>(null);
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
          <div className="tag">THE GRAND WEDDING</div>
          <p className="lead">Inter-branch arts festival · Register online and get your digital entry pass</p>
          <Button testId="landing-register-btn" variant={open === false ? "navy" : "primary"} onClick={() => nav("/register")}>
            {open === false ? "Registration closed" : "Register as a Student"}
          </Button>
          <button type="button" className="retrieve" onClick={() => nav("/my-pass")} data-testid="landing-retrieve-btn">
            Already registered? Retrieve my pass
          </button>
          <InstallApp />
        </div>
      </div>
    </BgScreen>
  );
}
