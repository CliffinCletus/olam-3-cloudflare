import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

/** Student pages: soft brand backdrop (logo colours + gold on white) with a sticky logo bar. */
export function StudentScreen({ children, back, backTo = "/", backLabel = "Back", right, wide, bare, testId }: {
  children: ReactNode; back?: boolean; backTo?: string; backLabel?: string; right?: ReactNode; wide?: boolean; bare?: boolean; testId?: string;
}) {
  const nav = useNavigate();
  return (
    <div className="student">
      {bare ? null : (
        <header className="student-bar">
          {back ? (
            <button type="button" className="icon-btn ghost" aria-label={backLabel} title={backLabel} onClick={() => nav(backTo, { state: { home: true } })} data-testid="student-back-btn">
              <ArrowLeft />
            </button>
          ) : null}
          <button type="button" className="brand" onClick={() => nav("/", { state: { home: true } })} aria-label="OLAM 3.0 home">
            <img src="/logo-mark.webp" alt="" />
            <span>OLAM 3.0</span>
          </button>
          <span className="spacer" />
          {right}
        </header>
      )}
      <main className={`student-main ${wide ? "wide" : ""}`} data-testid={testId}>{children}</main>
    </div>
  );
}
