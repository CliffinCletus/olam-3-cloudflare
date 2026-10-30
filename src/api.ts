// API client + staff session (same-origin: the Worker serves both the app and /api).
export type Role = "super_admin" | "coordinator" | "scanner";
export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  name?: string | null;
  branch_id?: string | null;
  active?: boolean;
  can_export?: boolean;
  must_change_password?: boolean;
};

const TOKEN_KEY = "olam3_token";
const USER_KEY = "olam3_user";

function read(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function write(k: string, v: string | null) {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ }
}

export function saveSession(token: string, user: AuthUser) {
  write(TOKEN_KEY, token);
  write(USER_KEY, JSON.stringify(user));
}
export const getToken = () => read(TOKEN_KEY);
export function getUser(): AuthUser | null {
  const raw = read(USER_KEY);
  try { return raw ? (JSON.parse(raw) as AuthUser) : null; } catch { return null; }
}
export function updateUser(patch: Partial<AuthUser>) {
  const u = getUser();
  if (u) write(USER_KEY, JSON.stringify({ ...u, ...patch }));
}
export function clearSession() {
  write(TOKEN_KEY, null);
  write(USER_KEY, null);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Set by the app so a 401 / forced password change can redirect without a page reload. */
let onAuthProblem: ((kind: "login" | "change-password") => void) | null = null;
export const setAuthHandler = (fn: typeof onAuthProblem) => { onAuthProblem = fn; };

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let r: Response;
  try {
    r = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "You appear to be offline. Check your connection and try again.");
  }
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const msg = typeof data?.detail === "string" ? data.detail : `Request failed (${r.status})`;
    if (r.status === 401 && token) { clearSession(); onAuthProblem?.("login"); }
    if (r.status === 403 && msg === "Password change required") onAuthProblem?.("change-password");
    throw new ApiError(r.status, msg);
  }
  return data as T;
}

export const post = <T = any>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T = any>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const put = <T = any>(path: string, body: unknown) => api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const del = <T = any>(path: string) => api<T>(path, { method: "DELETE" });

export async function login(email: string, password: string, signInAs?: Role, branchId?: string) {
  const data = await post<{ access_token: string; user: AuthUser }>("/auth/login", { email, password, sign_in_as: signInAs, branch_id: branchId });
  saveSession(data.access_token, data.user);
  return data.user;
}

/** Download an authenticated CSV. Returns an error message or null. */
export async function downloadCsv(path: string, filename: string): Promise<string | null> {
  try {
    const r = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
    if (!r.ok) return r.status === 403 ? "CSV download is not enabled for your account." : "Download failed. Please try again.";
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return null;
  } catch {
    return "Download failed. Check your connection.";
  }
}

// --- Shared types ------------------------------------------------------------------------
export type Branch = { id: string; name: string; active: boolean; created_at?: string };
export type Batch = { id: string; name: string; sort_order?: number; registrations?: number };
export type Registration = {
  id: string;
  reference: string;
  full_name: string;
  mobile: string;
  email: string;
  branch_id: string;
  branch_name: string | null;
  batch: string;
  batch_no?: string | null;
  faculty_name?: string | null;
  status: "pending" | "approved" | "rejected";
  rejection_reason?: string | null;
  created_at: string;
  reviewed_by_name?: string | null;
  checked_in: boolean;
  checked_in_at?: string | null;
};
export type EventInfo = { event_date: string | null; event_time_venue: string | null };
