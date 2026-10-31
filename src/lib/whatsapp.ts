/** wa.me needs the full international number (digits only); 10-digit numbers are treated as Indian (+91). */
export function waNumber(mobile: string): string | null {
  let n = (mobile || "").replace(/\D/g, "");
  if (n.length === 11 && n.startsWith("0")) n = n.slice(1);
  if (n.length === 10) n = `91${n}`;
  return n.length >= 11 ? n : null;
}

export function openWhatsApp(text: string, number?: string | null) {
  const url = `https://wa.me/${number ?? ""}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener");
}

/** Students open their pass with their email + mobile (or it opens by itself on the phone they registered with). */
export const myPassLink = () => `${window.location.origin}/my-pass`;

export const stationName = () => {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "web";
};
