// Web Push on WebCrypto: VAPID auth (RFC 8292) + aes128gcm payload encryption (RFC 8291). No Node dependencies.
import { type Env, b64url, fail, unb64url } from "./util";

export type PushSub = { endpoint: string; p256dh: string; auth: string };

const enc = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** Encrypts one push message for a browser subscription (single aes128gcm record). */
export async function encryptPayload(sub: Pick<PushSub, "p256dh" | "auth">, payload: Uint8Array): Promise<Uint8Array> {
  const uaPublic = unb64url(sub.p256dh);
  const authSecret = unb64url(sub.auth);
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as any, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // 0x02 = padding delimiter of the last (only) record.
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ct);
}

function vapidKeys(env: Env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) fail(500, "Push notifications are not configured (VAPID keys missing).");
  return { pub: env.VAPID_PUBLIC_KEY, priv: env.VAPID_PRIVATE_KEY };
}

/** `Authorization` header value for one push service origin (ES256-signed JWT). */
export async function vapidAuth(env: Env, endpoint: string): Promise<string> {
  const { pub, priv } = vapidKeys(env);
  const raw = unb64url(pub);
  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", x: b64url(raw.slice(1, 33)), y: b64url(raw.slice(33, 65)), d: priv, ext: true };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: `mailto:${env.INITIAL_ADMIN_EMAIL || "admin@example.com"}`,
  })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${pub}`;
}

/** Push services we deliver to (Chrome/Android, Apple, Firefox, Edge). Anything else is refused at subscribe time. */
export function isPushEndpoint(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const h = u.hostname;
  return h === "fcm.googleapis.com" || h === "android.googleapis.com" || h.endsWith(".push.apple.com") ||
    h.endsWith(".push.services.mozilla.com") || h.endsWith(".notify.windows.com");
}

/** Sends one notification. Returns the push service HTTP status (404/410 = subscription is gone). */
export async function sendPush(env: Env, sub: PushSub, message: Record<string, unknown>): Promise<number> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(message)));
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuth(env, sub.endpoint),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(24 * 3600),
      Urgency: "high",
    },
    body,
  });
  return r.status;
}
