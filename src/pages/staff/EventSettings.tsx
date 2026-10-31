import { useEffect, useState } from "react";
import { api, put } from "../../api";
import { CalendarDays, Lock, MapPin, Save, Unlock } from "lucide-react";
import { StaffShell, useStaff } from "../../components/Staff";
import { Alert, Button, Field, Spinner, Toggle, WithIcon, fmtDateTime } from "../../components/ui";

type Settings = { registration_open: boolean; closed_message: string; privacy_notice: string; event_date: string | null; event_time_venue: string | null; updated_at?: string | null; updated_by_name?: string | null };

export default function EventSettings() {
  const me = useStaff(["super_admin"]);
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!me) return;
    api<Settings>("/settings").then((r) => { setS(r); setSaved(r); }).catch((e) => setMsg({ ok: false, text: e.message }));
  }, [me]);

  async function save(next: Settings, okText = "Settings saved.") {
    setBusy(true); setMsg(null);
    try {
      const r = await put<Settings>("/settings", {
        registration_open: next.registration_open,
        closed_message: next.closed_message,
        privacy_notice: next.privacy_notice,
        event_date: next.event_date?.trim() || null,
        event_time_venue: next.event_time_venue?.trim() || null,
      });
      setS(r); setSaved(r); setMsg({ ok: true, text: okText });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  }

  return (
    <StaffShell user={me} title="Event settings" sub="Registration, messages, and the date & venue printed on passes.">
      {msg ? <div className="mb-12"><Alert tone={msg.ok ? "success" : "error"} testId="event-settings-msg">{msg.text}</Alert></div> : null}
        {!s && !msg ? <Spinner /> : null}
        {s && saved ? (
          <>
            <div className="card">
              <div className="row" style={{ gap: 12 }}>
              <span className="lead-ico" style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", flex: "0 0 42px", background: s.registration_open ? "var(--olive-100)" : "var(--c-100)", color: s.registration_open ? "var(--olive-700)" : "var(--c-700)" }}>{s.registration_open ? <Unlock /> : <Lock />}</span>
              <div style={{ flex: 1 }}><Toggle
                on={s.registration_open}
                disabled={busy}
                onClick={() => save({ ...saved, registration_open: !saved.registration_open }, saved.registration_open ? "Registration closed." : "Registration opened.")}
                title="Student registration"
                sub={<span style={{ color: s.registration_open ? "var(--olive-700)" : "var(--c-700)", fontWeight: 700 }} data-testid="event-registration-state">{s.registration_open ? "OPEN — students can register" : "CLOSED — new registrations blocked"}</span>}
                testId="event-registration-toggle"
              /></div></div>
              <p className="meta mt-8">Closing only stops new registrations. Approvals, passes and scanning keep working.</p>
            </div>

            <div className="card mt-16">
              <div className="card-title mb-12">Messages</div>
              <Field label="Message shown when registration is closed" htmlFor="es-closed">
                <textarea id="es-closed" className="input" value={s.closed_message} onChange={(e) => setS({ ...s, closed_message: e.target.value })} maxLength={400} data-testid="event-closed-message-input" />
              </Field>
              <Field label="Privacy notice (students must accept before submitting)" htmlFor="es-privacy">
                <textarea id="es-privacy" className="input" style={{ minHeight: 160 }} value={s.privacy_notice} onChange={(e) => setS({ ...s, privacy_notice: e.target.value })} maxLength={3000} data-testid="event-privacy-input" />
              </Field>
              <Button block={false} icon={<Save />} loading={busy} onClick={() => save({ ...saved, closed_message: s.closed_message, privacy_notice: s.privacy_notice })} testId="event-settings-save-btn">Save messages</Button>
            </div>

            <div className="card mt-16">
              <div className="card-title">Event date & venue</div>
              <p className="card-sub">Printed on every student's pass, PDF and shared image.</p>
              <div className="mt-12">
                <Field label="Event date" htmlFor="es-date">
                  <WithIcon icon={<CalendarDays />}><input id="es-date" className="input" type="date" value={s.event_date ?? ""} onChange={(e) => setS({ ...s, event_date: e.target.value })} data-testid="event-date-input" /></WithIcon>
                </Field>
                <Field label="Time & venue" htmlFor="es-venue">
                  <WithIcon icon={<MapPin />}><input id="es-venue" className="input" value={s.event_time_venue ?? ""} onChange={(e) => setS({ ...s, event_time_venue: e.target.value })} placeholder="9:30 AM · Delta Academy Kaloor Auditorium" maxLength={200} data-testid="event-venue-input" /></WithIcon>
                </Field>
              </div>
              <Button block={false} icon={<Save />} loading={busy} onClick={() => save({ ...saved, event_date: s.event_date, event_time_venue: s.event_time_venue }, "Event details saved.")} testId="event-details-save-btn">Save event details</Button>
            </div>
            {s.updated_at ? <p className="meta center-text mt-12">Last updated {fmtDateTime(s.updated_at)} by {s.updated_by_name}</p> : null}
          </>
        ) : null}
    </StaffShell>
  );
}
