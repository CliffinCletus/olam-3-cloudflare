import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, type EventInfo, type Registration, post } from "../api";
import { BgScreen } from "../components/BgScreen";
import { QRPassCard } from "../components/QRPassCard";
import { Button, Spinner } from "../components/ui";
import { type SavedPass, forgetPass, loadPass, savePass } from "../lib/pass";
import { deliverPdf, makePassPdf, passFileName } from "../lib/pass-pdf";
import { myPassLink, openWhatsApp } from "../lib/whatsapp";

export default function Pass() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const ref = (sp.get("ref") || "").toUpperCase();
  const [pass, setPass] = useState<SavedPass | null>(null);
  const [offline, setOffline] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadPass(ref);
    if (!saved) { setErr("Please open your pass from the My Registration page (reference + email)."); return; }
    post<{ registration: Registration; event: EventInfo }>("/pass/verify", { token: saved.token })
      .then((r) => {
        const fresh = { token: saved.token, registration: r.registration, event: r.event };
        savePass(fresh);
        setPass({ ...fresh, saved_at: new Date().toISOString() });
      })
      .catch((e: ApiError) => {
        if (e.status === 0) { setPass(saved); setOffline(true); } // no signal at the venue: the saved QR still works at the gate
        else { forgetPass(ref); setErr(e.message); }
      });
  }, [ref]);

  // Build the PDF ahead of time so the tap can open the share sheet immediately (iOS needs that).
  useEffect(() => {
    if (!pass) return;
    let live = true;
    makePassPdf(pass).then((b) => live && setPdf(b)).catch(() => live && setPdf(null));
    return () => { live = false; };
  }, [pass]);

  async function download() {
    if (!pass) return;
    setBusy(true); setMsg(null);
    try {
      const blob = pdf ?? (await makePassPdf(pass));
      await deliverPdf(blob, passFileName(pass.registration.reference));
    } catch (e: any) { setMsg(e?.message || "Could not create the PDF."); }
    finally { setBusy(false); }
  }

  function share() {
    if (!pass) return;
    const r = pass.registration;
    // Shares the reference + retrieve link only; the QR token never leaves this device.
    openWhatsApp(`🎉 I'm registered for OLAM 3.0 – The Grand Wedding!\n\nName: ${r.full_name}\nBranch: ${r.branch_name}\nReference: ${r.reference}\n\nOpen my pass (enter the registered email): ${myPassLink(r.reference)}`);
  }

  const r = pass?.registration;
  return (
    <BgScreen>
      <button type="button" className="back" style={{ color: "var(--gold)" }} onClick={() => nav(`/my-pass?ref=${encodeURIComponent(ref)}`)} data-testid="pass-back-btn">← Back</button>
      {!pass && !err ? <Spinner /> : null}
      {err ? <div className="panel mt-16"><p className="err" data-testid="pass-error">{err}</p><Button className="mt-16" onClick={() => nav("/my-pass")}>Retrieve my pass</Button></div> : null}
      {pass && r ? (
        <div className="mt-8">
          {offline ? <div className="offline-note" data-testid="pass-offline">You're offline — showing the pass saved on this phone. It still scans at the gate.</div> : null}
          <QRPassCard token={pass.token} name={r.full_name} reference={r.reference} branch={r.branch_name || ""} batch={r.batch} eventDate={pass.event?.event_date} venue={pass.event?.event_time_venue} />
          <div className="pass-actions">
            <Button testId="pass-save-pdf-btn" loading={busy} onClick={download}>Download pass (PDF)</Button>
            <Button testId="pass-whatsapp-btn" variant="wa" onClick={share}>Share on WhatsApp</Button>
            {msg ? <p className="err" data-testid="pass-save-error">{msg}</p> : null}
          </div>
          <p className="light-text">Save the PDF or add this app to your home screen so you can show your pass even without internet. Each pass admits one guest, one time.</p>
        </div>
      ) : null}
    </BgScreen>
  );
}
