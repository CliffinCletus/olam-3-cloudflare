import { useCallback, useEffect, useState } from "react";
import { api, post } from "../../api";
import { BellRing, Send, Sparkles } from "lucide-react";
import { BranchFilter, StaffShell, useBranches, useStaff } from "../../components/Staff";
import { Alert, Button, Chips, Field, Modal, Spinner } from "../../components/ui";

type Audience = "all" | "registered" | "pending" | "approved" | "not_arrived";
type Counts = Record<Audience, number>;
type Chunk = { sent: number; failed: number; removed: number; next: string | null };

const AUDIENCES: { id: Audience; name: string; sub: string }[] = [
  { id: "approved", name: "Approved", sub: "Students with a pass" },
  { id: "not_arrived", name: "Not arrived", sub: "Approved, not checked in yet" },
  { id: "pending", name: "Pending", sub: "Waiting for approval" },
  { id: "registered", name: "All registered", sub: "Every student who turned on reminders" },
  { id: "all", name: "Every device", sub: "Includes phones not linked to a registration" },
];

const TEMPLATES = [
  { title: "OLAM 3.0 is tomorrow! 🎉", body: "See you at OLAM 3.0 – A Grand Wedding. Keep your QR pass ready on your phone." },
  { title: "Gates are open 🎊", body: "OLAM 3.0 – A Grand Wedding has started. Show your QR pass at the entrance." },
];

export default function Notifications() {
  const user = useStaff(["super_admin"]);
  const branches = useBranches(!!user);
  const [branchId, setBranchId] = useState("");
  const [audience, setAudience] = useState<Audience>("approved");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState<{ sent: number; failed: number; removed: number } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadCounts = useCallback(async (bid: string) => {
    try { setCounts(await api<Counts>(`/push/stats${bid ? `?branch_id=${bid}` : ""}`)); }
    catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { if (user) loadCounts(""); }, [user, loadCounts]);

  async function send() {
    setConfirm(false); setErr(null); setDone(null);
    const total = { sent: 0, failed: 0, removed: 0 };
    setSending({ ...total });
    try {
      let after: string | null = null;
      do {
        const r: Chunk = await post<Chunk>("/push/send", { title: title.trim(), body: body.trim(), audience, branch_id: branchId || null, after });
        total.sent += r.sent; total.failed += r.failed; total.removed += r.removed;
        setSending({ ...total });
        after = r.next;
      } while (after);
      setDone(`Sent to ${total.sent} device${total.sent === 1 ? "" : "s"}.` +
        (total.removed ? ` ${total.removed} phone${total.removed === 1 ? " had" : "s had"} turned reminders off and ${total.removed === 1 ? "was" : "were"} removed.` : "") +
        (total.failed ? ` ${total.failed} could not be reached right now.` : ""));
      loadCounts(branchId);
    } catch (e: any) { setErr(e.message); }
    finally { setSending(null); }
  }

  if (!user) return <Spinner />;
  const n = counts?.[audience] ?? 0;
  const ready = title.trim().length >= 2 && body.trim().length >= 2 && n > 0 && !sending;

  return (
    <StaffShell user={user} title="Push reminders" sub="Goes to phones where the student tapped “Turn on reminders”. It arrives like any app notification, with the phone's notification sound.">
        <div className="card">
          <div className="card-head"><div className="card-title">Who gets it</div><BranchFilter user={user} branches={branches} value={branchId} onChange={(id) => { setBranchId(id); loadCounts(id); }} testPrefix="notify-branch" /></div>
          <Chips options={AUDIENCES.map((a) => ({ id: a.id, name: `${a.name} (${counts?.[a.id] ?? "…"})` }))} value={audience} onChange={setAudience} testPrefix="notify-audience" />
          <p className="meta mt-8">{AUDIENCES.find((a) => a.id === audience)?.sub}{branchId && audience === "all" ? " (with a branch picked, only linked phones count)" : ""}</p>
        </div>

        <div className="card mt-16">
          <div className="card-title">Message</div>
          <div className="chips mt-8">
            {TEMPLATES.map((t) => (
              <button type="button" key={t.title} className="chip" onClick={() => { setTitle(t.title); setBody(t.body); }}><Sparkles style={{ width: 15, height: 15, color: "var(--gold-700)" }} />{t.title}</button>
            ))}
          </div>
          <div className="mt-12">
            <Field label="Title" htmlFor="n-title">
              <input id="n-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="OLAM 3.0 is tomorrow! 🎉" data-testid="notify-title-input" />
            </Field>
            <Field label="Message" htmlFor="n-body" hint={`${body.length}/300`}>
              <textarea id="n-body" className="input" value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} placeholder="Keep your QR pass ready on your phone." data-testid="notify-body-input" />
            </Field>
          </div>
          <Button disabled={!ready} icon={<Send />} loading={!!sending} onClick={() => setConfirm(true)} testId="notify-send-btn">
            {n > 0 ? `Send to ${n} device${n === 1 ? "" : "s"}` : "No devices in this group yet"}
          </Button>
          {sending ? <p className="meta mt-8" data-testid="notify-progress">Sending… {sending.sent} delivered so far</p> : null}
          {done ? <Alert tone="success" testId="notify-done">{done}</Alert> : null}
          {err ? <Alert tone="error" testId="notify-error">{err}</Alert> : null}
        </div>
        <div className="mt-16"><Alert tone="info">Students turn reminders on from their pass or registration page. On iPhone this only works after they add OLAM 3.0 to the Home Screen (iOS 16.4 or later).</Alert></div>

      <Modal open={confirm} onClose={() => setConfirm(false)}>
        <div className="modal-ico" style={{ background: "var(--blue-100)", color: "var(--blue-600)" }}><BellRing /></div>
        <h2>Send this reminder?</h2>
        <p className="sub"><strong>{title}</strong><br />{body}</p>
        <p className="meta mt-12">To {n} device{n === 1 ? "" : "s"} • {AUDIENCES.find((a) => a.id === audience)?.name}{branchId ? ` • ${branches.find((b) => b.id === branchId)?.name}` : ""}. This can't be recalled.</p>
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setConfirm(false)} testId="notify-cancel-btn">Cancel</Button>
          <Button icon={<Send />} onClick={send} testId="notify-confirm-btn">Send</Button>
        </div>
      </Modal>
    </StaffShell>
  );
}
