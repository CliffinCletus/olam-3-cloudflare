import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, type EventInfo, type Registration, post } from "../api";
import { BgScreen } from "../components/BgScreen";
import { PushOptIn } from "../components/PushOptIn";
import { QRPassCard } from "../components/QRPassCard";
import { Button, Spinner } from "../components/ui";
import { type SavedPass, forgetMe, forgetPass, formatEventDate, loadMe, loadPass, savePass } from "../lib/pass";
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
  const [msg, setMsg] = useState<string | null>(null);

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
        if (e.status === 0) setOffline(true); // no signal at the venue: the saved QR still works at the gate
        else { forgetPass(ref); setPass(null); setErr(e.message); }
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
    } catch (e: any) { setMsg(e?.message || "Could not create the PDF."); }
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
      if (res === "downloaded") setMsg("Your pass image was saved. Open WhatsApp and attach it from your gallery or downloads.");
    } catch (e: any) { setMsg(e?.message || "Could not share the pass."); }
    finally { setBusy(null); }
  }

  function notMe() {
    forgetMe();
    if (ref) forgetPass(ref);
    nav("/", { replace: true, state: { home: true } });
  }

  const r = pass?.registration;
  return (
    <BgScreen>
      <button type="button" className="back" style={{ color: "var(--gold)" }} onClick={() => nav("/", { state: { home: true } })} data-testid="pass-back-btn">← Home</button>
      {!pass && !err ? <Spinner /> : null}
      {err ? (
        <div className="panel mt-16">
          <p className="err" data-testid="pass-error">{err}</p>
          <Button className="mt-16" onClick={() => nav("/my-pass", { replace: true })}>Check my registration</Button>
        </div>
      ) : null}
      {pass && r ? (
        <div className="mt-8">
          {offline ? <div className="offline-note" data-testid="pass-offline">You're offline — showing the pass saved on this phone. It still scans at the gate.</div> : null}
          <QRPassCard token={pass.token} name={r.full_name} reference={r.reference} branch={r.branch_name || ""} batch={r.batch} eventDate={pass.event?.event_date} venue={pass.event?.event_time_venue} />
          <div className="pass-actions">
            <Button testId="pass-save-pdf-btn" loading={busy === "pdf"} onClick={download}>Download pass (PDF)</Button>
            <Button testId="pass-whatsapp-btn" variant="wa" loading={busy === "share"} onClick={share}>Share pass image on WhatsApp</Button>
            {msg ? <p className="err" data-testid="pass-save-error">{msg}</p> : null}
          </div>
          <PushOptIn me={me} />
          <p className="light-text">This app remembers your pass — open it any time, even without internet. Each pass admits one guest, one time.</p>
          <div className="pass-links">
            <button type="button" onClick={notMe} data-testid="pass-not-me-btn">Not you? Remove this pass from this phone</button>
          </div>
        </div>
      ) : null}
    </BgScreen>
  );
}
