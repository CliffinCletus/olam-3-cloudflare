// Downloadable PDF ticket (jsPDF is only loaded on the pass page).
import { jsPDF } from "jspdf";
import { type SavedPass, formatEventDate, qrDataUrl } from "./pass";

// --- PDF ----------------------------------------------------------------------------------
const NAVY = "#0B192C";
const GOLD = "#D4AF37";
const IVORY = "#FDFBF7";
const DISPLAY = '"Playfair Display", Georgia, serif';
const TEXT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Letter-spaced text centred on cx (canvas letterSpacing isn't available everywhere). */
function spaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = "left";
  chars.forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + spacing; });
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

function wrap(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lh: number) {
  const words = text.split(" ");
  let line = "";
  ctx.textAlign = "center";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, cx, y); line = w; y += lh; }
    else line = test;
  }
  if (line) ctx.fillText(line, cx, y);
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/** Draws the ticket on an A5-proportioned canvas (≈210 dpi). */
async function drawTicket(p: SavedPass): Promise<HTMLCanvasElement> {
  try {
    await Promise.all([
      document.fonts.load(`700 120px "Playfair Display"`),
      document.fonts.load(`700 30px Inter`),
      document.fonts.load(`500 30px Inter`),
    ]);
  } catch { /* fall back to system fonts */ }
  const W = 1240, H = 1754;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = IVORY;
  ctx.fillRect(0, 0, W, H);

  const tx = 110, ty = 100, tw = W - 220, th = H - 200, cx = W / 2;
  roundRect(ctx, tx, ty, tw, th, 56);
  ctx.fillStyle = NAVY;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = GOLD;
  ctx.stroke();

  ctx.fillStyle = GOLD;
  ctx.font = `700 28px ${TEXT}`;
  spaced(ctx, "DELTA ACADEMY PRESENTS", cx, ty + 110, 12);
  ctx.fillStyle = IVORY;
  ctx.font = `700 124px ${DISPLAY}`;
  ctx.textAlign = "center";
  ctx.fillText("OLAM 3.0", cx, ty + 250);
  ctx.globalAlpha = 0.85;
  ctx.font = `500 30px ${TEXT}`;
  spaced(ctx, "THE GRAND WEDDING", cx, ty + 310, 18);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(212,175,55,0.5)";
  ctx.fillRect(tx + 70, ty + 360, tw - 140, 3);

  const qrSize = 500, pad = 34, boxY = ty + 405;
  roundRect(ctx, cx - qrSize / 2 - pad, boxY, qrSize + pad * 2, qrSize + pad * 2, 36);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  const qr = await loadImage(await qrDataUrl(p.token, qrSize));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, cx - qrSize / 2, boxY + pad, qrSize, qrSize);

  ctx.fillStyle = GOLD;
  ctx.font = `700 40px ${TEXT}`;
  spaced(ctx, p.registration.reference, cx, boxY + qrSize + pad * 2 + 64, 10);

  const rows: [string, string][] = [
    ["GUEST", p.registration.full_name],
    ["BRANCH", p.registration.branch_name || "—"],
    ["BATCH", p.registration.batch],
    ["STATUS", "APPROVED"],
  ];
  if (p.event?.event_date) rows.push(["DATE", formatEventDate(p.event.event_date)]);
  if (p.event?.event_time_venue) rows.push(["VENUE", p.event.event_time_venue]);

  let y = boxY + qrSize + pad * 2 + 130;
  ctx.fillStyle = "rgba(212,175,55,0.25)";
  ctx.fillRect(tx + 70, y - 42, tw - 140, 2);
  const lx = tx + 80, rx = tx + tw - 80;
  for (const [l, v] of rows) {
    ctx.textAlign = "left";
    ctx.fillStyle = GOLD;
    ctx.font = `700 26px ${TEXT}`;
    ctx.fillText(l, lx, y);
    ctx.textAlign = "right";
    ctx.fillStyle = IVORY;
    ctx.font = `500 34px ${TEXT}`;
    ctx.fillText(fitText(ctx, v, rx - lx - 200), rx, y);
    y += 56;
  }

  ctx.globalAlpha = 0.7;
  ctx.fillStyle = IVORY;
  ctx.font = `400 26px ${TEXT}`;
  wrap(ctx, "Show this pass (printed or on your phone) at the entrance. Each pass admits one guest, one time. Do not share it.", cx, Math.max(y + 24, ty + th - 110), tw - 200, 38);
  ctx.globalAlpha = 1;
  return cv;
}

export async function makePassPdf(p: SavedPass): Promise<Blob> {
  const canvas = await drawTicket(p);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5", compress: true });
  doc.setProperties({ title: `OLAM 3.0 pass – ${p.registration.reference}`, author: "Delta Academy" });
  doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 148, 210, undefined, "FAST");
  return doc.output("blob");
}

export const passFileName = (ref: string) => `OLAM-3.0-pass-${ref}.pdf`;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** iPhone: share sheet ("Save to Files", WhatsApp, Print). Everywhere else: a normal file download. */
export async function deliverPdf(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: "application/pdf" });
  if (isIOS() && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e: any) {
      if (e?.name === "AbortError") return; // user closed the sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
