import { useEffect, useState } from "react";
import { formatEventDate, qrDataUrl } from "../lib/pass";

export function QRPassCard({ token, name, reference, branch, batch, eventDate, venue }: {
  token: string; name: string; reference: string; branch: string; batch: string; eventDate?: string | null; venue?: string | null;
}) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => { qrDataUrl(token, 440).then(setSrc).catch(() => setSrc("")); }, [token]);
  return (
    <div className="ticket" data-testid="qr-pass-card">
      <div className="ey">DELTA ACADEMY PRESENTS</div>
      <div className="ev">OLAM 3.0</div>
      <div className="tg">THE GRAND WEDDING</div>
      <div className="perf" />
      <div className="qr">{src ? <img src={src} alt={`QR entry pass ${reference}`} data-testid="qr-image" /> : <div style={{ width: 220, height: 220 }} />}</div>
      <div className="ref">{reference}</div>
      <div className="rows">
        <Row l="GUEST" v={name} />
        <Row l="BRANCH" v={branch} />
        <Row l="BATCH" v={batch} />
        {eventDate ? <Row l="DATE" v={formatEventDate(eventDate)} /> : null}
        {venue ? <Row l="VENUE" v={venue} /> : null}
      </div>
      <div className="note">Present this pass at the entrance. One scan per guest.</div>
    </div>
  );
}

const Row = ({ l, v }: { l: string; v: string }) => (
  <div className="r"><span>{l}</span><span title={v}>{v}</span></div>
);
