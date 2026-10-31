import { useEffect, useState } from "react";
import { formatEventDate, qrDataUrl } from "../lib/pass";

/** The entry pass: an ivory ticket with the logo, QR and the guest's details. */
export function QRPassCard({ token, name, reference, branch, batch, eventDate, venue }: {
  token: string; name: string; reference: string; branch: string; batch: string; eventDate?: string | null; venue?: string | null;
}) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => { qrDataUrl(token, 440).then(setSrc).catch(() => setSrc("")); }, [token]);
  return (
    <div className="ticket" data-testid="qr-pass-card">
      <div className="ticket-org">DELTA ACADEMY PRESENTS</div>
      <img className="ticket-logo" src="/logo-mark.webp" alt="OLAM 3.0 — A Grand Wedding" />
      <div className="ticket-tag">ENTRY PASS</div>
      <div><div className="ticket-qr">{src ? <img src={src} alt={`QR entry pass ${reference}`} data-testid="qr-image" /> : <div style={{ width: 220, height: 220 }} />}</div></div>
      <div className="ticket-ref">{reference}</div>
      <div className="ticket-cut" aria-hidden />
      <dl className="kv">
        <div className="full"><dt>Guest</dt><dd>{name}</dd></div>
        <div><dt>Branch</dt><dd>{branch || "—"}</dd></div>
        <div><dt>Batch</dt><dd>{batch}</dd></div>
        {eventDate ? <div className="full"><dt>Date</dt><dd>{formatEventDate(eventDate)}</dd></div> : null}
        {venue ? <div className="full"><dt>Time & venue</dt><dd>{venue}</dd></div> : null}
      </dl>
      <p className="ticket-note">Show this pass at the entrance · One entry per guest</p>
    </div>
  );
}
