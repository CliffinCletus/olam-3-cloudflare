import { AlertTriangle, Check as CheckIcon, CheckCircle2, Info, Search, XCircle } from "lucide-react";
import { type ReactNode, useEffect } from "react";

type BtnVariant = "primary" | "secondary" | "ghost" | "gold" | "success" | "danger" | "danger-soft" | "wa";

export function Button({
  children, onClick, loading, disabled, variant = "primary", small, large, block = true, icon, iconRight, className = "", type = "button", testId, title,
}: {
  children: ReactNode; onClick?: () => void; loading?: boolean; disabled?: boolean; variant?: BtnVariant; small?: boolean; large?: boolean;
  /** Full width (default). Pass block={false} for an inline button. */
  block?: boolean; icon?: ReactNode; iconRight?: ReactNode; className?: string; type?: "button" | "submit"; testId?: string; title?: string;
}) {
  const size = small ? "btn-sm" : large ? "btn-lg" : "";
  return (
    <button
      type={type}
      data-testid={testId}
      title={title}
      className={`btn btn-${variant} ${size} ${block && !small ? "block" : ""} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? <span className="spinner" aria-label="Loading" /> : <>{icon}{children}{iconRight}</>}
    </button>
  );
}

/** Square icon-only button; `label` is the accessible name and tooltip. */
export function IconButton({ label, icon, onClick, variant = "", small, disabled, loading, testId, onDark }: {
  label: string; icon: ReactNode; onClick?: () => void; variant?: "" | "ghost" | "danger" | "success"; small?: boolean; disabled?: boolean; loading?: boolean; testId?: string; onDark?: boolean;
}) {
  return (
    <button type="button" className={`icon-btn ${variant} ${small ? "sm" : ""} ${onDark ? "on-dark" : ""}`} aria-label={label} title={label} onClick={onClick} disabled={disabled || loading} data-testid={testId}>
      {loading ? <span className="spinner" /> : icon}
    </button>
  );
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

/** Input with a leading icon: <WithIcon icon={<Mail />}><input className="input" /></WithIcon> */
export const WithIcon = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => <div className="input-wrap">{icon}{children}</div>;

export function SearchInput({ value, onChange, placeholder, testId, label = "Search" }: { value: string; onChange: (v: string) => void; placeholder: string; testId?: string; label?: string }) {
  return (
    <div className="input-wrap search">
      <Search />
      <input className="input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} data-testid={testId} autoCorrect="off" />
    </div>
  );
}

export type Tone = "info" | "success" | "warning" | "error" | "muted" | "gold";
export const Pill = ({ label, tone = "info" }: { label: string; tone?: Tone }) => <span className={`pill ${tone}`}>{label.charAt(0).toUpperCase() + label.slice(1)}</span>;
export const statusTone = (s: string): Tone => (s === "approved" ? "success" : s === "pending" ? "warning" : "error");

export const Spinner = () => <div className="spinner page" role="status" aria-label="Loading" />;

const ALERT_ICON = { success: <CheckCircle2 />, error: <XCircle />, warning: <AlertTriangle />, info: <Info /> };
export function Alert({ tone = "info", children, testId }: { tone?: keyof typeof ALERT_ICON; children: ReactNode; testId?: string }) {
  return (
    <div className={`alert ${tone}`} role={tone === "error" ? "alert" : "status"} data-testid={testId}>
      {ALERT_ICON[tone]}
      <div className="grow">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, children, testId }: { icon: ReactNode; title: string; children?: ReactNode; testId?: string }) {
  return (
    <div className="empty" data-testid={testId}>
      <div className="ico">{icon}</div>
      <strong>{title}</strong>
      {children ? <div className="small">{children}</div> : null}
    </div>
  );
}

export type StatTone = "crimson" | "gold" | "olive" | "yellow" | "blue" | "blush";
export function StatCard({ label, value, icon, tone, testId, onClick }: { label: string; value: ReactNode; icon: ReactNode; tone: StatTone; testId?: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`stat tone-${tone} ${onClick ? "clickable" : ""}`} data-testid={testId} onClick={onClick} style={onClick ? { font: "inherit" } : undefined}>
      <div className="top"><span className="l">{label}</span><span className="ico">{icon}</span></div>
      <div className="v">{value}</div>
    </Tag>
  );
}

export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Toggle({ on, onClick, title, sub, testId, disabled }: { on: boolean; onClick: () => void; title: ReactNode; sub?: ReactNode; testId?: string; disabled?: boolean }) {
  return (
    <button type="button" className="toggle-row" onClick={onClick} data-testid={testId} disabled={disabled} aria-pressed={on}>
      <div style={{ flex: 1 }}>
        <div className="name">{title}</div>
        {sub ? <div className="meta">{sub}</div> : null}
      </div>
      <span className={`switch ${on ? "on" : ""}`} />
    </button>
  );
}

export const CheckBox = ({ on }: { on: boolean }) => <span className={`cb ${on ? "on" : ""}`}>{on ? <CheckIcon /> : null}</span>;

export function Check({ on, onClick, children, testId }: { on: boolean; onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button type="button" className="check-row" onClick={onClick} data-testid={testId} aria-pressed={on}>
      <CheckBox on={on} />
      <span>{children}</span>
    </button>
  );
}

export function Chips<T extends string>({ options, value, onChange, scroll, testPrefix }: {
  options: { id: T; name: string }[]; value: T; onChange: (v: T) => void; scroll?: boolean; testPrefix?: string;
}) {
  return (
    <div className={`chips ${scroll ? "scroll" : ""}`} role="radiogroup">
      {options.map((o) => (
        <button type="button" role="radio" aria-checked={value === o.id} key={o.id || "all"} className={`chip ${value === o.id ? "on" : ""}`} onClick={() => onChange(o.id)} data-testid={testPrefix ? `${testPrefix}-${o.id || "all"}` : undefined}>
          {value === o.id ? <CheckIcon /> : null}{o.name}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, testPrefix, label }: {
  options: { id: T; name: string; count?: number }[]; value: T; onChange: (v: T) => void; testPrefix?: string; label: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button type="button" role="tab" aria-selected={value === o.id} key={o.id} className={value === o.id ? "on" : ""} onClick={() => onChange(o.id)} data-testid={testPrefix ? `${testPrefix}-${o.id}` : undefined}>
          {o.name}{o.count !== undefined ? <span className="count num">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Select({ value, onChange, options, label, testId }: { value: string; onChange: (v: string) => void; options: { id: string; name: string }[]; label: string; testId?: string }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} data-testid={testId}>
      {options.map((o) => <option key={o.id || "all"} value={o.id}>{o.name}</option>)}
    </select>
  );
}

export const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const fmtTime = (s?: string | null) => (s ? new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");
