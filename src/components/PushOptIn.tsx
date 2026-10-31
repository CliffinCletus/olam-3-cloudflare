import { Bell, BellOff, BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import type { Me } from "../lib/pass";
import { type PushState, enablePush, pushState, syncPush } from "../lib/push";
import { Button } from "./ui";

/** "Turn on reminders" card for students (confirmation, status and pass pages). */
export function PushOptIn({ me }: { me: Me | null }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    pushState().then((s) => {
      if (!live) return;
      setState(s);
      if (s === "on") syncPush(me);
    }).catch(() => setState("unsupported"));
    return () => { live = false; };
  }, [me?.email, me?.mobile]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state || state === "unsupported") return null;

  async function turnOn() {
    setBusy(true); setErr(null);
    try { setState(await enablePush(me)); }
    catch (e: any) { setErr(e?.message || "Could not turn on reminders. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="push-card" data-testid="push-optin">
      <div className={`ico ${state === "on" ? "on" : ""}`}>{state === "on" ? <BellRing /> : state === "denied" ? <BellOff /> : <Bell />}</div>
      <div className="body">
        {state === "on" ? (
          <p data-testid="push-on"><strong>Reminders are on</strong>We'll send event updates to this phone.</p>
        ) : state === "denied" ? (
          <p data-testid="push-denied"><strong>Notifications are blocked</strong>To get event reminders, allow notifications for OLAM 3.0 in your phone's settings.</p>
        ) : state === "needs-install" ? (
          <p data-testid="push-needs-install"><strong>Want event reminders?</strong>In Safari tap Share → <b>Add to Home Screen</b>, open OLAM 3.0 from your Home Screen and turn reminders on there.</p>
        ) : (
          <>
            <p><strong>Get event reminders</strong>We'll notify this phone before OLAM 3.0 starts and with any important updates.</p>
            <Button small variant="secondary" icon={<Bell />} onClick={turnOn} loading={busy} testId="push-enable-btn">Turn on reminders</Button>
          </>
        )}
        {err ? <p className="err" role="alert">{err}</p> : null}
      </div>
    </div>
  );
}
