import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QrScanner from "qr-scanner";
import { api, clearSession, post } from "../../api";
import { useStaff } from "../../components/Staff";
import { ArrowLeft, Camera, CameraOff, Check, CheckCircle2, ClipboardCheck, Copy, Keyboard, LogOut, ScanLine, WifiOff, XCircle } from "lucide-react";
import { Button, EmptyState, Field, IconButton, Pill, WithIcon, fmtDateTime, fmtTime } from "../../components/ui";
import { stationName } from "../../lib/whatsapp";

type ScanResult = {
  result: "VALID" | "ALREADY_CHECKED_IN" | "NOT_APPROVED" | "REVOKED" | "INVALID" | "ERROR";
  message: string;
  checked_in_at?: string | null;
  scanner_name?: string | null;
  registration?: { full_name: string; reference: string; batch: string; branch_name?: string | null };
};
type Hist = { id: string; full_name: string; reference: string; batch: string; branch_name: string; checked_in_at: string };

export default function Scanner() {
  const nav = useNavigate();
  const user = useStaff(["super_admin", "coordinator", "scanner"]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef({ v: "", t: 0 });
  const sounds = useRef<{ ok: HTMLAudioElement; no: HTMLAudioElement } | null>(null);
  const [camState, setCamState] = useState<"idle" | "starting" | "on" | "denied" | "nocam">("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<Hist[]>([]);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(() => { api<Hist[]>("/scan/history").then(setHistory).catch(() => {}); }, []);
  useEffect(() => { if (user) loadHistory(); }, [user, loadHistory]);

  const play = (a?: HTMLAudioElement) => { if (!a) return; try { a.currentTime = 0; void a.play().catch(() => {}); } catch { /* ignore */ } };

  const submitScan = useCallback(async (raw: string) => {
    const t = raw.trim();
    // Cameras report the same code many times per second; the ref blocks repeats before state updates land.
    if (!t || busyRef.current) return;
    const now = Date.now();
    if (lastRef.current.v === t && now - lastRef.current.t < 2500) return;
    lastRef.current = { v: t, t: now };
    busyRef.current = true;
    setBusy(true);
    let r: ScanResult;
    try {
      r = await post<ScanResult>("/scan", { token: t, station: stationName() });
      loadHistory();
    } catch (e: any) {
      r = { result: "ERROR", message: e.message || "Network error" };
    }
    setResult(r);
    setBusy(false);
    if (r.result === "VALID") play(sounds.current?.ok);
    else if (r.result !== "ERROR") play(sounds.current?.no);
    navigator.vibrate?.(r.result === "VALID" ? 80 : [60, 60, 60]);
  }, [loadHistory]);

  async function startCamera() {
    // This tap also unlocks audio on iPhone (sounds must start from a user gesture once).
    if (!sounds.current) {
      const ok = new Audio("/sounds/welcome-chime.wav");
      const no = new Audio("/sounds/refused-tone.wav");
      for (const a of [ok, no]) { a.preload = "auto"; a.muted = true; void a.play().then(() => { a.pause(); a.muted = false; }).catch(() => { a.muted = false; }); }
      sounds.current = { ok, no };
    }
    if (!videoRef.current) return;
    setCamState("starting");
    try {
      if (!(await QrScanner.hasCamera())) { setCamState("nocam"); return; }
      scannerRef.current?.destroy();
      const s = new QrScanner(videoRef.current, (res) => submitScan(res.data), {
        preferredCamera: "environment",
        returnDetailedScanResult: true,
        maxScansPerSecond: 8,
        highlightScanRegion: false,
        highlightCodeOutline: false,
      });
      scannerRef.current = s;
      await s.start();
      setCamState("on");
    } catch {
      setCamState("denied");
    }
  }

  useEffect(() => () => { scannerRef.current?.destroy(); scannerRef.current = null; }, []);

  function resume() {
    setResult(null);
    setManual("");
    busyRef.current = false;
    lastRef.current = { v: "", t: 0 };
  }

  if (!user) return <div className="scanner" />;
  const kind = !result ? "" : result.result === "VALID" ? "valid" : result.result === "ALREADY_CHECKED_IN" ? "dup" : result.result === "ERROR" ? "net" : "bad";
  const LABEL: Record<string, string> = { VALID: "Entry approved", ALREADY_CHECKED_IN: "Already used", NOT_APPROVED: "Not approved", REVOKED: "Pass revoked", INVALID: "Invalid pass", ERROR: "Connection problem" };

  return (
    <div className="scanner">
      <header className="topbar">
        {user.role !== "scanner" ? <IconButton variant="ghost" label="Back to dashboard" icon={<ArrowLeft />} onClick={() => nav("/staff/dashboard")} testId="scanner-dashboard-btn" /> : <img className="logo" src="/logo-mark.webp" alt="" />}
        <div className="t">Gate scanner<div className="small muted" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>{user.name || user.email}</div></div>
        <IconButton variant="ghost" label="Sign out" icon={<LogOut />} onClick={() => { clearSession(); nav("/staff/login", { replace: true }); }} testId="scanner-logout-btn" />
      </header>

      <div className={`cam ${result ? "small" : ""}`}>
        <video ref={videoRef} playsInline muted data-testid="scanner-camera-view" />
        {camState === "on" ? <div className="viewfinder" /> : null}
        {camState !== "on" ? (
          <div className="perm">
            <div className="ico">{camState === "denied" || camState === "nocam" ? <CameraOff /> : <ScanLine />}</div>
            {camState === "denied" ? (
              <>
                <strong>Camera permission needed</strong>
                <p>Allow camera access for this site in your browser settings, then tap below. You can also type a reference underneath.</p>
              </>
            ) : camState === "nocam" ? (
              <strong>No camera found on this device</strong>
            ) : (
              <>
                <strong>Ready to scan entry passes</strong>
                <p>Point the back camera at the QR code on the student's pass.</p>
              </>
            )}
            {camState !== "nocam" ? (
              <Button block={false} variant="gold" icon={<Camera />} onClick={startCamera} loading={camState === "starting"} testId="scanner-start-btn">{camState === "denied" ? "Try again" : "Start scanning"}</Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="body">
        {result ? (
          <div className={`result-card ${kind}`} data-testid={kind === "valid" ? "scanner-welcome-card" : "scanner-result-card"}>
            <div className="ico">{kind === "valid" ? <CheckCircle2 /> : kind === "dup" ? <Copy /> : kind === "net" ? <WifiOff /> : <XCircle />}</div>
            <div className="label">{LABEL[result.result] ?? result.result}</div>
            {result.registration ? (
              <>
                {kind === "valid" ? <div className="mt">Welcome to OLAM 3.0 – A Grand Wedding,</div> : <div className="msg">{result.message}</div>}
                <div className="nm" data-testid={kind === "valid" ? "scanner-welcome-name" : undefined}>{result.registration.full_name}</div>
                <div className="chip-line">
                  <Pill label={result.registration.branch_name || "—"} tone="gold" />
                  <Pill label={result.registration.batch} tone="muted" />
                  <Pill label={result.registration.reference} tone="info" />
                </div>
                {kind === "valid" ? <span className="sr-only" data-testid="scanner-welcome-branch">{result.registration.branch_name}</span> : null}
              </>
            ) : <div className="msg">{result.message}</div>}
            {result.checked_in_at ? <div className="mt">{kind === "valid" ? "Checked in at " : "Entered at "}{kind === "valid" ? fmtTime(result.checked_in_at) : fmtDateTime(result.checked_in_at)}{result.scanner_name && kind !== "valid" ? ` · by ${result.scanner_name}` : ""}</div> : null}
            <Button large icon={<ScanLine />} onClick={resume} testId="scanner-continue-btn">Scan next</Button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); lastRef.current = { v: "", t: 0 }; submitScan(manual); }}>
            <Field label="Manual lookup" htmlFor="sc-manual" hint="Type the reference (OLM-XXXXXX) if a QR won't scan.">
              <div className="row">
                <div className="grow"><WithIcon icon={<Keyboard />}><input id="sc-manual" className="input" value={manual} onChange={(e) => setManual(e.target.value)} autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="OLM-XXXXXX or pass token" data-testid="scanner-manual-input" /></WithIcon></div>
                <Button block={false} type="submit" loading={busy} testId="scanner-manual-submit-btn">Check</Button>
              </div>
            </Field>
          </form>
        )}

        <div className="group-title mt-24">Recent check-ins<span className="count">{history.length ? `${Math.min(history.length, 10)} latest` : ""}</span></div>
        {history.length === 0 ? <EmptyState icon={<ClipboardCheck />} title="No scans yet" /> : (
          <div className="list">
            {history.slice(0, 10).map((h) => (
              <div className="hist" key={h.id}>
                <span className="dot"><Check /></span>
                <div className="main">
                  <div className="item-top"><span className="name">{h.full_name}</span><span className="t">{fmtTime(h.checked_in_at)}</span></div>
                  <div className="meta">{h.reference} · {h.branch_name} · {h.batch}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
