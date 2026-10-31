import {
  BarChart3, BellRing, CalendarCog, ClipboardCheck, GraduationCap, History, KeyRound, LayoutDashboard, LogOut, Menu,
  ScanLine, Settings2, UserCog, UserX, Users,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { type AuthUser, type Branch, type Role, api, clearSession, getUser, updateUser } from "../api";
import { Modal, Select } from "./ui";

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

export function useMedia(query: string) {
  const [on, setOn] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const l = () => setOn(m.matches);
    m.addEventListener("change", l);
    return () => m.removeEventListener("change", l);
  }, [query]);
  return on;
}

/** Super admins get a branch picker; coordinators are always on their own branch. */
export function BranchFilter({ user, branches, value, onChange, testPrefix }: {
  user: AuthUser | null; branches: Branch[]; value: string; onChange: (id: string) => void; testPrefix: string;
}) {
  if (user?.role !== "super_admin") return null;
  return <Select label="Branch" value={value} onChange={onChange} options={[{ id: "", name: "All branches" }, ...branches]} testId={`${testPrefix}-select`} />;
}

export const canExportCsv = (u: AuthUser | null) => u?.role === "super_admin" || !!u?.can_export;

// --- Navigation ----------------------------------------------------------------------------------
type NavItem = { key: string; to: string; label: string; icon: ReactNode; admin?: boolean };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Event", items: [
    { key: "overview", to: "/staff/dashboard", label: "Overview", icon: <LayoutDashboard /> },
    { key: "regs", to: "/staff/dashboard?tab=regs", label: "Registrations", icon: <Users /> },
    { key: "scanner", to: "/staff/scanner", label: "Gate scanner", icon: <ScanLine /> },
  ] },
  { group: "Attendance", items: [
    { key: "attendance", to: "/staff/attendance", label: "Check-in log", icon: <ClipboardCheck /> },
    { key: "absent", to: "/staff/absent", label: "Not arrived", icon: <UserX /> },
    { key: "summary", to: "/staff/event-summary", label: "Day summary", icon: <BarChart3 /> },
    { key: "faculty", to: "/staff/faculty-report", label: "Faculty report", icon: <GraduationCap /> },
  ] },
  { group: "Admin", items: [
    { key: "notifications", to: "/staff/notifications", label: "Push reminders", icon: <BellRing />, admin: true },
    { key: "event", to: "/staff/event-settings", label: "Event settings", icon: <CalendarCog />, admin: true },
    { key: "settings", to: "/staff/dashboard?tab=settings", label: "Branches & batches", icon: <Settings2 />, admin: true },
    { key: "staff", to: "/staff/manage", label: "Staff accounts", icon: <UserCog />, admin: true },
    { key: "audit", to: "/staff/audit", label: "Activity log", icon: <History />, admin: true },
  ] },
];

function activeKey(pathname: string, search: string): string {
  const tab = new URLSearchParams(search).get("tab");
  if (pathname === "/staff/dashboard") return tab === "regs" ? "regs" : tab === "settings" ? "settings" : "overview";
  const all = NAV.flatMap((g) => g.items);
  return all.find((i) => i.to === pathname)?.key ?? "";
}

const ROLE_LABEL: Record<Role, string> = { super_admin: "Admin", coordinator: "Coordinator", scanner: "Gate scanner" };
const initials = (u: AuthUser) => (u.name || u.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");

/** App frame for every staff page: wine sidebar on desktop, top bar + bottom tabs on phones. */
export function StaffShell({ user, title, sub, actions, children }: {
  user: AuthUser | null; title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode;
}) {
  const nav = useNavigate();
  const loc = useLocation();
  const desktop = useMedia("(min-width: 1024px)");
  const [more, setMore] = useState(false);
  const isAdmin = user?.role === "super_admin";
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.admin || isAdmin) })).filter((g) => g.items.length);
  const current = activeKey(loc.pathname, loc.search);
  const go = (to: string) => { setMore(false); nav(to); };
  const signOut = () => { clearSession(); nav("/staff/login", { replace: true }); };

  const account = (
    <>
      <button type="button" onClick={() => go("/staff/change-password")} data-testid="dashboard-change-password-btn"><KeyRound />Change password</button>
      <button type="button" onClick={signOut} data-testid="dashboard-logout-btn"><LogOut />Sign out</button>
    </>
  );

  return (
    <div className="shell">
      {desktop ? (
        <aside className="sidebar" aria-label="Main navigation">
          <div className="brand">
            <div className="logo"><img src="/logo-mark.webp" alt="" /></div>
            <div><div className="t">OLAM 3.0</div><div className="s">{user?.role === "coordinator" ? "BRANCH DASHBOARD" : "ADMIN DASHBOARD"}</div></div>
          </div>
          <nav className="nav">
            {groups.map((g) => (
              <div className="nav-group" key={g.group}>
                <div className="h">{g.group}</div>
                {g.items.map((i) => (
                  <button type="button" key={i.key} className={`nav-item ${current === i.key ? "on" : ""}`} onClick={() => go(i.to)} data-testid={`nav-${i.key}`} aria-current={current === i.key ? "page" : undefined}>
                    {i.icon}{i.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          {user ? (
            <div>
              <div className="me">
                <span className="avatar">{initials(user)}</span>
                <div className="who"><b>{user.name || user.email}</b><span>{ROLE_LABEL[user.role]}</span></div>
              </div>
              <button type="button" className="nav-item" onClick={() => go("/staff/change-password")} data-testid="dashboard-change-password-btn"><KeyRound />Change password</button>
              <button type="button" className="nav-item" onClick={signOut} data-testid="dashboard-logout-btn"><LogOut />Sign out</button>
            </div>
          ) : null}
        </aside>
      ) : (
        <header className="topbar">
          <img className="logo" src="/logo-mark.webp" alt="OLAM 3.0" />
          <div className="t">OLAM 3.0<div className="small muted" style={{ fontFamily: "var(--sans)", fontWeight: 600 }}>{user ? ROLE_LABEL[user.role] : ""}</div></div>
          {user ? <button type="button" className="avatar" style={{ border: 0, cursor: "pointer" }} onClick={() => setMore(true)} aria-label="Account and more pages">{initials(user)}</button> : null}
        </header>
      )}

      <div className="shell-main">
        <main className="page">
          <div className="page-header">
            <div className="titles">
              <h1>{title}</h1>
              {sub ? <p className="sub">{sub}</p> : null}
            </div>
            {actions ? <div className="actions">{actions}</div> : null}
          </div>
          {children}
        </main>
      </div>

      {!desktop ? (
        <>
          <nav className="bottom-nav" aria-label="Main navigation">
            <button type="button" className={current === "overview" ? "on" : ""} onClick={() => go("/staff/dashboard")} data-testid="nav-overview"><LayoutDashboard /><span>Home</span></button>
            <button type="button" className={current === "regs" ? "on" : ""} onClick={() => go("/staff/dashboard?tab=regs")} data-testid="nav-regs"><Users /><span>Students</span></button>
            <button type="button" className={`scan ${current === "scanner" ? "on" : ""}`} onClick={() => go("/staff/scanner")} data-testid="nav-scanner"><span className="bubble"><ScanLine /></span><span>Scan</span></button>
            <button type="button" className={current === "attendance" ? "on" : ""} onClick={() => go("/staff/attendance")} data-testid="nav-attendance"><ClipboardCheck /><span>Check-ins</span></button>
            <button type="button" className={more ? "on" : ""} onClick={() => setMore(true)} data-testid="nav-more"><Menu /><span>More</span></button>
          </nav>
          <Modal open={more} onClose={() => setMore(false)}>
            {user ? (
              <div className="row" style={{ gap: 12 }}>
                <span className="avatar" style={{ width: 44, height: 44, flexBasis: 44 }}>{initials(user)}</span>
                <div style={{ minWidth: 0 }}><div className="name">{user.name || user.email}</div><div className="meta">{ROLE_LABEL[user.role]} · {user.email}</div></div>
              </div>
            ) : null}
            <div className="more-list">
              {groups.flatMap((g) => g.items).filter((i) => !["overview", "regs", "scanner", "attendance"].includes(i.key)).map((i) => (
                <button type="button" key={i.key} className={current === i.key ? "on" : ""} onClick={() => go(i.to)} data-testid={`more-${i.key}`}>{i.icon}{i.label}</button>
              ))}
              <div className="sep" />
              {account}
            </div>
          </Modal>
        </>
      ) : null}
    </div>
  );
}
