// Event reminders via Web Push. The service worker side lives in public/push-sw.js.
import { api, post } from "../api";
import { isIOS, isStandalone } from "./device";
import type { Me } from "./pass";

/** needs-install: iPhone only delivers web notifications to apps added to the Home Screen. */
export type PushState = "unsupported" | "needs-install" | "default" | "on" | "denied";

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return "needs-install";
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted" && (await currentSubscription())) return "on";
  return "default";
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64url.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Must run from a tap (iPhone requires a user gesture for the permission prompt). */
export async function enablePush(me: Me | null): Promise<PushState> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "default";
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { key } = await api<{ key: string }>("/push/public-key");
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  }
  await post("/push/subscribe", { subscription: sub.toJSON(), email: me?.email, mobile: me?.mobile });
  return "on";
}

/** Keeps an existing subscription linked to the student on this device (quietly). */
export async function syncPush(me: Me | null) {
  const sub = await currentSubscription().catch(() => null);
  if (sub) post("/push/subscribe", { subscription: sub.toJSON(), email: me?.email, mobile: me?.mobile }).catch(() => {});
}
