import { Download, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, type EventInfo, type Registration, post } from "../api";
import { PushOptIn } from "../components/PushOptIn";
import { QRPassCard } from "../components/QRPassCard";
import { StudentScreen } from "../components/StudentScreen";
import { Alert, Button, Spinner } from "../components/ui";
import { type SavedPass, forgetMe, forgetPass, formatEventDate, loadMe, loadPass, passSavedOnDevice, savePass } from "../lib/pass";
import { makePassPng, passImageName, sharePassImage } from "../lib/pass-image";
import { deliverPdf, makePassPdf, passFileName } from "../lib/pass-pdf";

export default function Pass() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const me = loadMe();
  const ref = (sp.get("ref") || me?.reference || "").toUpperCase();
  const [pass, setPass] = useState<SavedPass | null>(null);
  const [offline, setOffline] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [png, setPng] = useState<Blob | null>(null);
  const [busy, setBusy] = useState<"pdf" | "share" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const saved = ref ? loadPass(ref) : null;
    if (!saved) { nav("/my-pass", { replace: true }); return; }
    setPass(saved); // show the saved pass straight away; refresh it in the background
    post<{ registration: Registration; event: EventInfo }>("/pass/verify", { token: saved.token })
      .then((r) => {
        const fresh = { token: saved.token, registration: r.registration, event: r.event };
        savePass(fresh);
        setPass({ ...fresh, saved_at: new Date().toISOString() });
        setOffline(false);
      })
      .catch((e: ApiError) => {
        // Only a revoked / unknown pass is dropped. No signal, "too many attempts" or a server hiccup
        // keep showing the saved QR — it still scans at the gate.
        if (e.status === 404 || e.status === 403) { forgetPass(ref); setPass(null); setErr(e.message); }
        else if (e.status === 0) setOffline(true);
      });
  }, [ref, nav]);

  // Build the files ahead of time so a tap can open the share sheet immediately (iOS needs that).
  useEffect(() => {
    if (!pass) return;
    let live = true;
    makePassPng(pass).then((b) => live && setPng(b)).catch(() => live && setPng(null));
    makePassPdf(pass).then((b) => live && setPdf(b)).catch(() => live && setPdf(null));
    return () => { live = false; };
  }, [pass]);

  async function download() {
    if (!pass) return;
    setBusy("pdf"); setMsg(null);
    try {
      const blob = pdf ?? (await makePassPdf(pass));
      await deliverPdf(blob, passFileName(pass.registration.reference));
    } catch (e: any) { setMsg({ ok: false, text: e?.message || "Could not create the PDF." }); }
    finally { setBusy(null); }
  }

  async function share() {
    if (!pass) return;
    const r = pass.registration;
    setBusy("share"); setMsg(null);
    try {
      const blob = png ?? (await makePassPng(pass));
      const when = [pass.event?.event_date ? formatEventDate(pass.event.event_date) : "", pass.event?.event_time_venue || ""].filter(Boolean).join(" · ");
      const caption = `🎉 I'm registered for OLAM 3.0 – A Grand Wedding!\n\nName: ${r.full_name}\nBranch: ${r.branch_name || "—"}\nBatch: ${r.batch}\nReference: ${r.reference}${when ? `\n${when}` : ""}`;
      const res = await sharePassImage(blob, passImageName(r.reference), caption);
      if (res === "downloaded") setMsg({ ok: true, text: "Your pass image was saved. Open WhatsApp and attach it from your gallery or downloads." });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || "Could not share the pass." }); }
    finally { setBusy(null); }
  }

  function notMe() {
    forgetMe();
    if (ref) forgetPass(ref);
    nav("/", { replace: true, state: { home: true } });
  }

  const r = pass?.registration;
  return (
    <StudentScreen back backLabel="Home">
      {!pass && !err ? <Spinner /> : null}
      {err ? (
        <div className="sheet">
          <Alert tone="error" testId="pass-error">{err}</Alert>
          <Button className="mt-16" onClick={() => nav("/my-pass", { replace: true })}>Check my registration</Button>
        </div>
      ) : null}
      {pass && r ? (
        <>
          {!passSavedOnDevice() ? <div className="offline-note"><Alert tone="warning" testId="pass-not-saved">This browser isn't saving your pass on this phone. Tap Download below to keep a copy, or open the site in Chrome or Safari.</Alert></div> : null}
          {offline ? <div className="offline-note"><Alert tone="warning" testId="pass-offline">You're offline — showing the pass saved on this phone. It still scans at the gate.</Alert></div> : null}
          <QRPassCard token={pass.token} name={r.full_name} reference={r.reference} branch={r.branch_name || ""} batch={r.batch} eventDate={pass.event?.event_date} venue={pass.event?.event_time_venue} />
          <div className="pass-actions">
            <Button large variant="wa" icon={<Share2 />} testId="pass-whatsapp-btn" loading={busy === "share"} onClick={share}>Share pass on WhatsApp</Button>
            <Button variant="secondary" icon={<Download />} testId="pass-save-pdf-btn" loading={busy === "pdf"} onClick={download}>Download PDF</Button>
            {msg ? <Alert tone={msg.ok ? "success" : "error"} testId="pass-save-error">{msg.text}</Alert> : null}
          </div>
          <PushOptIn me={me} />
          <p className="foot-note">This app keeps your pass — open it any time, even without internet.</p>
          <div className="pass-links">
            <button type="button" className="link-btn muted" onClick={notMe} data-testid="pass-not-me-btn">Not you? Remove this pass from this phone</button>
          </div>
        </>
      ) : null}
    </StudentScreen>
  );
}
