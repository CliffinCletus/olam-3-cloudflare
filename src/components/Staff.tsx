import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type AuthUser, type Branch, type Role, api, getUser, updateUser } from "../api";

/**
 * Loads the signed-in staff user (refreshing from /auth/me) and redirects when not allowed.
 * `roles` = who may see this page. Scanners are sent to the scanner.
 */
export function useStaff(roles: Role[] = ["super_admin", "coordinator"]) {
  const nav = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(() => {
    const u = getUser();
    return u && roles.includes(u.role) ? u : null;
  });
  useEffect(() => {
    document.body.classList.add("staff");
    return () => document.body.classList.remove("staff");
  }, []);
  useEffect(() => {
    const u = getUser();
    if (!u) { nav("/staff/login", { replace: true }); return; }
    if (u.must_change_password) { nav("/staff/change-password", { replace: true }); return; }
    if (!roles.includes(u.role)) { nav(u.role === "scanner" ? "/staff/scanner" : "/staff/login", { replace: true }); return; }
    api<AuthUser>("/auth/me").then((me) => { updateUser(me); setUser(me); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return user;
}

export function useBranches(enabled: boolean) {
  const [branches, setBranches] = useState<Branch[]>([]);
  useEffect(() => { if (enabled) api<Branch[]>("/branches").then(setBranches).catch(() => {}); }, [enabled]);
  return branches;
}

export function PageHead({ eyebrow, title, sub, backTo = "/staff/dashboard", backLabel = "← Dashboard", children }: {
  eyebrow: string; title: string; sub?: ReactNode; backTo?: string; backLabel?: string; children?: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <div className="page-head">
      <button type="button" className="back" onClick={() => (window.history.length > 1 ? nav(-1) : nav(backTo))} data-testid="page-back-btn">{backLabel}</button>
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      {sub ? <p className="sub">{sub}</p> : null}
      {children}
    </div>
  );
}

/** Super admins get an "All branches" chip row; coordinators are always on their own branch. */
export function BranchFilter({ user, branches, value, onChange, testPrefix }: {
  user: AuthUser | null; branches: Branch[]; value: string; onChange: (id: string) => void; testPrefix: string;
}) {
  if (user?.role !== "super_admin") return null;
  return (
    <div className="chips scroll mt-12">
      {[{ id: "", name: "All branches" }, ...branches].map((b) => (
        <button key={b.id || "all"} type="button" className={`chip ${value === b.id ? "on" : ""}`} onClick={() => onChange(b.id)} data-testid={`${testPrefix}-${b.id || "all"}`}>
          {b.name}
        </button>
      ))}
    </div>
  );
}

export const canExportCsv = (u: AuthUser | null) => u?.role === "super_admin" || !!u?.can_export;
