import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QrScanner from "qr-scanner";
import { api, clearSession, post } from "../../api";
import { useStaff } from "../../components/Staff";
import { Button, Field, fmtDateTime, fmtTime } from "../../components/ui";
import { stationName } from "../../lib/whatsapp";

type ScanResult = {
  result: "VALID" | "ALREADY_CHECKED_IN" | "NOT_APPROVED" | "REVOKED" | "INVALID" | "ERROR";
  message: string;
  checked_in_at?: string | null;
  scanner_name?: string | null;
  registration?: { full_name: string; reference: string; batch: string; branch_name?: string | null };
};
type Hist = { id: string; full_name: string; reference: string; batch: string; branch_name: string; checked_in_at: string };

const TONE: Record<string, string> = { VALID: "#10B981", ALREADY_CHECKED_IN: "#F59E0B", ERROR: "#3B82F6" };

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
  const tone = result ? TONE[result.result] || "#EF4444" : "";

  return (
    <div className="scanner">
      <header className="staff-header">
        <div className="top">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">OLAM 3.0 • SCANNER</div>
            <div className="hello" style={{ fontSize: 18 }}>{user.name || user.email}</div>
          </div>
          <div className="actions">
            {user.role !== "scanner" ? <button type="button" className="head-link" onClick={() => nav("/staff/dashboard")} data-testid="scanner-dashboard-btn">Dashboard</button> : null}
            <button type="button" className="head-link" onClick={() => { clearSession(); nav("/staff/login", { replace: true }); }} data-testid="scanner-logout-btn">Sign out</button>
          </div>
        </div>
      </header>

      <div className={`cam ${result ? "small" : ""}`}>
        <video ref={videoRef} playsInline muted data-testid="scanner-camera-view" />
        {camState === "on" ? <div className="viewfinder" /> : null}
        {camState !== "on" ? (
          <div className="perm">
            {camState === "denied" ? (
              <>
                <strong>Camera permission needed</strong>
                <p className="small" style={{ opacity: 0.8 }}>Allow camera access for this site in your browser settings, then tap below. You can also type a reference underneath.</p>
              </>
            ) : camState === "nocam" ? (
              <strong>No camera found on this device</strong>
            ) : (
              <>
                <strong>Ready to scan entry passes</strong>
                <p className="small" style={{ opacity: 0.8 }}>Point the back camera at the QR code on the student's pass.</p>
              </>
            )}
            {camState !== "nocam" ? (
              <Button onClick={startCamera} loading={camState === "starting"} testId="scanner-start-btn">{camState === "denied" ? "Try again" : "Start scanning"}</Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="body">
        {result?.result === "VALID" && result.registration ? (
          <div className="welcome" data-testid="scanner-welcome-card">
            <div className="ey">✦ ENTRY APPROVED ✦</div>
            <div className="hello">Welcome to OLAM 3.0,</div>
            <div className="nm" data-testid="scanner-welcome-name">{result.registration.full_name}</div>
            <div className="dv" />
            <div className="br" data-testid="scanner-welcome-branch">{result.registration.branch_name}</div>
            <div className="mt">{result.registration.batch} • {result.registration.reference}</div>
            <div className="ln">The Grand Wedding awaits you. Enjoy the celebration!</div>
            {result.checked_in_at ? <div className="mt">Checked in at {fmtTime(result.checked_in_at)}</div> : null}
            <Button className="mt-16" onClick={resume} testId="scanner-continue-btn">Scan next</Button>
          </div>
        ) : result ? (
          <div className="result" style={{ borderColor: tone }} data-testid="scanner-result-card">
            <span className="badge" style={{ background: tone }}>{result.result.replace(/_/g, " ")}</span>
            <div className="msg">{result.message}</div>
            {result.registration ? (
              <>
                <div className="nm">{result.registration.full_name}</div>
                <div className="mt">{result.registration.reference}</div>
                <div className="mt">{result.registration.branch_name} • {result.registration.batch}</div>
              </>
            ) : null}
            {result.checked_in_at ? <div className="mt">At {fmtDateTime(result.checked_in_at)}{result.scanner_name ? ` • by ${result.scanner_name}` : ""}</div> : null}
            <Button className="mt-16" onClick={resume} testId="scanner-continue-btn">Scan next</Button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); lastRef.current = { v: "", t: 0 }; submitScan(manual); }}>
            <Field label="Manual token / reference lookup" htmlFor="sc-manual">
              <div className="row">
                <input id="sc-manual" className="input grow" value={manual} onChange={(e) => setManual(e.target.value)} autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="Paste pass token or OLM-XXXXXX" data-testid="scanner-manual-input" />
                <Button small type="submit" className="btn-auto" loading={busy} testId="scanner-manual-submit-btn">Check</Button>
              </div>
            </Field>
          </form>
        )}

        <div className="section-title">Recent Check-ins</div>
        {history.length === 0 ? <p className="empty">No scans yet.</p> : null}
        {history.slice(0, 10).map((h) => (
          <div className="hist" key={h.id}>
            <div className="item-top"><span className="name">{h.full_name}</span><span className="t">{fmtTime(h.checked_in_at)}</span></div>
            <div className="mt">{h.reference} • {h.branch_name} • {h.batch}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
