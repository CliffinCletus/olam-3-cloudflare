// The pass as a picture: drawn once on a canvas, used for the PNG (WhatsApp / gallery) and the PDF.
import { type SavedPass, formatEventDate, qrDataUrl } from "./pass";

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

/** Splits text into lines no wider than maxW (long single words are broken by character). */
function lines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxW) { line = test; continue; }
    if (line) out.push(line);
    line = word;
    while (ctx.measureText(line).width > maxW && line.length > 1) {
      let i = line.length - 1;
      while (i > 1 && ctx.measureText(line.slice(0, i)).width > maxW) i--;
      out.push(line.slice(0, i));
      line = line.slice(i);
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/** Draws the ticket on an A5-proportioned canvas (≈210 dpi). Long values wrap instead of running off the ticket. */
export async function drawTicket(p: SavedPass): Promise<HTMLCanvasElement> {
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
  spaced(ctx, "A GRAND WEDDING", cx, ty + 310, 18);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(212,175,55,0.5)";
  ctx.fillRect(tx + 70, ty + 355, tw - 140, 3);

  const qrSize = 460, pad = 34, boxY = ty + 395;
  roundRect(ctx, cx - qrSize / 2 - pad, boxY, qrSize + pad * 2, qrSize + pad * 2, 36);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  const qr = await loadImage(await qrDataUrl(p.token, qrSize));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, cx - qrSize / 2, boxY + pad, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;

  const boxEnd = boxY + qrSize + pad * 2;
  ctx.fillStyle = GOLD;
  ctx.font = `700 40px ${TEXT}`;
  spaced(ctx, p.registration.reference, cx, boxEnd + 60, 10);

  const rows: [string, string][] = [
    ["GUEST", p.registration.full_name],
    ["BRANCH", p.registration.branch_name || "—"],
    ["BATCH", p.registration.batch],
    ["STATUS", "APPROVED"],
  ];
  if (p.event?.event_date) rows.push(["DATE", formatEventDate(p.event.event_date)]);
  if (p.event?.event_time_venue) rows.push(["VENUE", p.event.event_time_venue]);

  let y = boxEnd + 125;
  ctx.fillStyle = "rgba(212,175,55,0.25)";
  ctx.fillRect(tx + 70, y - 42, tw - 140, 2);
  const lx = tx + 80, rx = tx + tw - 80, valueW = rx - lx - 190;
  for (const [l, v] of rows) {
    ctx.textAlign = "left";
    ctx.fillStyle = GOLD;
    ctx.font = `700 26px ${TEXT}`;
    ctx.fillText(l, lx, y);
    ctx.textAlign = "right";
    ctx.fillStyle = IVORY;
    ctx.font = `500 32px ${TEXT}`;
    const ls = lines(ctx, v, valueW).slice(0, 3);
    ls.forEach((t, i) => ctx.fillText(t, rx, y + i * 40));
    y += 52 + (ls.length - 1) * 40;
  }

  ctx.globalAlpha = 0.7;
  ctx.fillStyle = IVORY;
  ctx.font = `400 26px ${TEXT}`;
  ctx.textAlign = "center";
  const note = lines(ctx, "Show this pass at the entrance (printed or on your phone). Each pass admits one guest, one time.", tw - 200);
  let ny = Math.max(y + 20, ty + th - 50 - (note.length - 1) * 38);
  for (const t of note) { ctx.fillText(t, cx, ny); ny += 38; }
  ctx.globalAlpha = 1;
  return cv;
}

export async function makePassPng(p: SavedPass): Promise<Blob> {
  const cv = await drawTicket(p);
  return new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image."))), "image/png"));
}

export const passImageName = (ref: string) => `OLAM-3.0-pass-${ref}.png`;

/** Plain browser download of a file. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Sends the pass picture with a caption through the phone's share sheet (pick WhatsApp; the image can be saved there).
 * Where sharing files isn't supported (most desktops) the image is downloaded and WhatsApp opens with the caption.
 */
export async function sharePassImage(blob: Blob, filename: string, caption: string): Promise<"shared" | "cancelled" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/png" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: caption });
      return "shared";
    } catch (e: any) {
      if (e?.name === "AbortError") return "cancelled";
    }
  }
  saveBlob(blob, filename);
  return "downloaded";
}
