import { type ReactNode, useEffect } from "react";

type BtnVariant = "primary" | "navy" | "ghost" | "danger" | "wa";

export function Button({
  children, onClick, loading, disabled, variant = "primary", small, className = "", type = "button", testId,
}: {
  children: ReactNode; onClick?: () => void; loading?: boolean; disabled?: boolean; variant?: BtnVariant; small?: boolean;
  className?: string; type?: "button" | "submit"; testId?: string;
}) {
  return (
    <button
      type={type}
      data-testid={testId}
      className={`btn btn-${variant} ${small ? "btn-sm" : ""} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? <span className="spinner" aria-label="Loading" /> : children}
    </button>
  );
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export type Tone = "info" | "success" | "warning" | "error" | "muted";
export const Pill = ({ label, tone = "info" }: { label: string; tone?: Tone }) => <span className={`pill ${tone}`}>{label}</span>;

export const statusTone = (s: string): Tone => (s === "approved" ? "success" : s === "pending" ? "warning" : "error");

export const Spinner = () => <div className="spinner gold" role="status" aria-label="Loading" />;

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

export function Check({ on, onClick, children, testId }: { on: boolean; onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button type="button" className="check-row" onClick={onClick} data-testid={testId} aria-pressed={on}>
      <span className={`cb ${on ? "on" : ""}`}>{on ? "✓" : ""}</span>
      <span>{children}</span>
    </button>
  );
}

export function Chips<T extends string>({ options, value, onChange, scroll, testPrefix }: {
  options: { id: T; name: string }[]; value: T; onChange: (v: T) => void; scroll?: boolean; testPrefix?: string;
}) {
  return (
    <div className={`chips ${scroll ? "scroll" : ""}`}>
      {options.map((o) => (
        <button type="button" key={o.id || "all"} className={`chip ${value === o.id ? "on" : ""}`} onClick={() => onChange(o.id)} data-testid={testPrefix ? `${testPrefix}-${o.id || "all"}` : undefined}>
          {o.name}
        </button>
      ))}
    </div>
  );
}

export const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const fmtTime = (s?: string | null) => (s ? new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");
