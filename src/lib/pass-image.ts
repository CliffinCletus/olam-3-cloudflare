// The pass as a picture: drawn once on a canvas, used for the PNG (WhatsApp / gallery) and the PDF.
import { type SavedPass, formatEventDate, qrDataUrl } from "./pass";

// Same palette as styles.css (logo crimson, gold, white).
const PAGE = "#FFFFFF";
const CRIMSON_600 = "#C1222A";
const CRIMSON_700 = "#A11B22";
const CRIMSON_900 = "#4F0C10";
const CRIMSON_950 = "#2E0709";
const TEXT_2 = "#7A4A4E";
const GOLD_200 = "#F1E3BB";
const GOLD_300 = "#E8D39A";
const GOLD_700 = "#8A6A1F";
const DISPLAY = '"Fraunces", Georgia, serif';
const SANS = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Letter-spaced text centred on x (or starting at x) — canvas letterSpacing isn't available everywhere. */
function spaced(ctx: CanvasRenderingContext2D, text: string, x0: number, y: number, spacing: number, align: "center" | "left" = "center") {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = align === "center" ? x0 - total / 2 : x0;
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

/** Draws the ticket on an A5-proportioned canvas (≈210 dpi), matching the on-screen pass. Long values wrap. */
export async function drawTicket(p: SavedPass): Promise<HTMLCanvasElement> {
  try {
    await Promise.all([
      document.fonts.load(`600 40px "Fraunces"`),
      document.fonts.load(`700 30px "Plus Jakarta Sans"`),
      document.fonts.load(`600 30px "Plus Jakarta Sans"`),
    ]);
  } catch { /* fall back to system fonts */ }
  const W = 1240, H = 1754;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = PAGE;
  ctx.fillRect(0, 0, W, H);

  // Ticket paper with a gold double border
  const tx = 90, ty = 80, tw = W - 180, th = H - 160, cx = W / 2;
  ctx.save();
  ctx.shadowColor = "rgba(79, 12, 16, 0.12)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, tx, ty, tw, th, 64);
  const paper = ctx.createLinearGradient(0, ty, 0, ty + th);
  paper.addColorStop(0, "#FFFDF8");
  paper.addColorStop(1, "#FFF8EE");
  ctx.fillStyle = paper;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 4;
  ctx.strokeStyle = GOLD_300;
  roundRect(ctx, tx, ty, tw, th, 64);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = GOLD_200;
  roundRect(ctx, tx + 18, ty + 18, tw - 36, th - 36, 48);
  ctx.stroke();

  ctx.fillStyle = GOLD_700;
  ctx.font = `700 24px ${SANS}`;
  spaced(ctx, "DELTA ACADEMY PRESENTS", cx, ty + 92, 9);

  try {
    const logo = await loadImage("/logo-mark.webp");
    const lh = 240, lw = (logo.naturalWidth / logo.naturalHeight) * lh;
    ctx.drawImage(logo, cx - lw / 2, ty + 112, lw, lh);
  } catch {
    ctx.fillStyle = CRIMSON_900;
    ctx.font = `600 110px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.fillText("OLAM 3.0", cx, ty + 280);
  }

  // "ENTRY PASS" tag
  ctx.font = `700 22px ${SANS}`;
  const tagW = 250, tagY = ty + 376;
  roundRect(ctx, cx - tagW / 2, tagY, tagW, 46, 23);
  ctx.fillStyle = CRIMSON_600;
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  spaced(ctx, "ENTRY PASS", cx, tagY + 31, 5);

  // QR on a white tile
  const qrSize = 400, pad = 26, boxY = ty + 452;
  roundRect(ctx, cx - qrSize / 2 - pad, boxY, qrSize + pad * 2, qrSize + pad * 2, 36);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = GOLD_200;
  ctx.stroke();
  const qr = await loadImage(await qrDataUrl(p.token, qrSize));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, cx - qrSize / 2, boxY + pad, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;
  const boxEnd = boxY + qrSize + pad * 2;

  ctx.fillStyle = CRIMSON_700;
  ctx.font = `800 36px ${SANS}`;
  spaced(ctx, p.registration.reference, cx, boxEnd + 62, 8);

  // Perforation with notches
  const cutY = boxEnd + 108;
  ctx.save();
  ctx.setLineDash([16, 12]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = GOLD_300;
  ctx.beginPath();
  ctx.moveTo(tx + 40, cutY);
  ctx.lineTo(tx + tw - 40, cutY);
  ctx.stroke();
  ctx.restore();
  for (const x of [tx, tx + tw]) {
    ctx.beginPath();
    ctx.arc(x, cutY, 26, 0, Math.PI * 2);
    ctx.fillStyle = PAGE;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = GOLD_300;
    ctx.beginPath();
    ctx.arc(x, cutY, 26, x === tx ? -Math.PI / 2 : Math.PI / 2, x === tx ? Math.PI / 2 : (3 * Math.PI) / 2);
    ctx.stroke();
  }

  // Details: label above value, two columns where it fits
  const left = tx + 90, right = tx + tw - 90, colW = (right - left - 40) / 2;
  type Cell = { l: string; v: string; full?: boolean };
  const cells: Cell[] = [
    { l: "GUEST", v: p.registration.full_name, full: true },
    { l: "BRANCH", v: p.registration.branch_name || "—" },
    { l: "BATCH", v: p.registration.batch },
  ];
  if (p.event?.event_date) cells.push({ l: "DATE", v: formatEventDate(p.event.event_date), full: true });
  if (p.event?.event_time_venue) cells.push({ l: "TIME & VENUE", v: p.event.event_time_venue, full: true });

  let y = cutY + 78;
  for (let i = 0; i < cells.length; i++) {
    const row = cells[i].full ? [cells[i]] : [cells[i], cells[i + 1]].filter((c) => c && !c.full);
    if (!cells[i].full && row.length === 2) i++;
    let maxLines = 1;
    row.forEach((c, j) => {
      const x = left + j * (colW + 40);
      const w = c.full ? right - left : colW;
      ctx.textAlign = "left";
      ctx.fillStyle = GOLD_700;
      ctx.font = `700 21px ${SANS}`;
      spaced(ctx, c.l, x, y, 3, "left");
      ctx.fillStyle = CRIMSON_950;
      ctx.font = `600 31px ${SANS}`;
      ctx.textAlign = "left";
      const ls = lines(ctx, c.v, w).slice(0, 3);
      ls.forEach((t, k) => ctx.fillText(t, x, y + 42 + k * 40));
      maxLines = Math.max(maxLines, ls.length);
    });
    y += 42 + (maxLines - 1) * 40 + 58;
  }

  ctx.fillStyle = TEXT_2;
  ctx.font = `500 23px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillText("Show this pass at the entrance · One entry per guest", cx, Math.max(y + 6, ty + th - 58));
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
