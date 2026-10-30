import type { ReactNode } from "react";

/** Event artwork edge-to-edge: the poster fits the width (headline never cropped), a blurred copy fills the rest. */
export function BgScreen({ children, dim = 0.6, center, bare }: { children: ReactNode; dim?: number; center?: boolean; bare?: boolean }) {
  const d = dim;
  return (
    <div className="bg-screen">
      <div className="bg-art" aria-hidden>
        <div className="blur" />
        <div className="poster" />
        {d > 0 ? (
          <div className="dim" style={{ background: `linear-gradient(rgba(0,0,0,${d * 0.6}), rgba(0,0,0,${d}), rgba(0,0,0,${Math.min(d + 0.25, 0.97)}))` }} />
        ) : null}
      </div>
      <div className={`bg-content ${center ? "center" : ""} ${bare ? "bare" : ""}`}>{children}</div>
    </div>
  );
}
