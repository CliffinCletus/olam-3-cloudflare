// Downloadable PDF ticket (jsPDF is only loaded on the pass page).
import { jsPDF } from "jspdf";
import { isIOS } from "./device";
import type { SavedPass } from "./pass";
import { drawTicket, saveBlob } from "./pass-image";

export async function makePassPdf(p: SavedPass): Promise<Blob> {
  const canvas = await drawTicket(p);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5", compress: true });
  doc.setProperties({ title: `OLAM 3.0 pass – ${p.registration.reference}`, author: "Delta Academy" });
  doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 148, 210, undefined, "FAST");
  return doc.output("blob");
}

export const passFileName = (ref: string) => `OLAM-3.0-pass-${ref}.pdf`;

/** iPhone: share sheet ("Save to Files", WhatsApp, Print). Everywhere else: a normal file download. */
export async function deliverPdf(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type || "application/pdf" });
  if (isIOS() && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e: any) {
      if (e?.name === "AbortError") return; // user closed the sheet
    }
  }
  saveBlob(blob, filename);
}
