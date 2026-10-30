import { useState } from "react";
import { type Batch, type Branch, del, patch, post, put } from "../api";
import { Button, Modal } from "./ui";

export function BranchRow({ branch, onSaved }: { branch: Branch; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(branch.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(next: { name: string; active: boolean }) {
    setBusy(true); setErr(null);
    try { await patch(`/branches/${branch.id}`, next); setEditing(false); onSaved(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="edit-row" data-testid={`branch-row-${branch.id}`}>
      {editing ? (
        <form className="line" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save({ name: name.trim(), active: branch.active }); }}>
          <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} data-testid={`branch-name-input-${branch.id}`} aria-label="Branch name" />
          <Button small type="submit" loading={busy} testId={`branch-save-btn-${branch.id}`}>Save</Button>
          <button type="button" className="chip-btn" onClick={() => { setEditing(false); setErr(null); setName(branch.name); }} data-testid={`branch-cancel-btn-${branch.id}`}>Cancel</button>
        </form>
      ) : (
        <div className="line">
          <div className="grow">
            <div className="name" style={{ color: branch.active ? undefined : "var(--muted)" }}>{branch.name}</div>
            <div className="small" style={{ color: branch.active ? "var(--success-text)" : "var(--error-text)" }}>{branch.active ? "Open for registration" : "Switched off — hidden from form"}</div>
          </div>
          <button type="button" className="chip-btn" onClick={() => { setName(branch.name); setEditing(true); }} data-testid={`branch-edit-btn-${branch.id}`}>Rename</button>
          <button type="button" className={`chip-btn ${branch.active ? "danger" : "success"}`} disabled={busy} onClick={() => save({ name: branch.name, active: !branch.active })} data-testid={`branch-toggle-btn-${branch.id}`}>
            {branch.active ? "Switch off" : "Switch on"}
          </button>
        </div>
      )}
      {err ? <p className="err">{err}</p> : null}
    </div>
  );
}

/** Super-admin batch editor: add, rename (renames existing registrations too), reorder, delete. */
export function BatchEditor({ batches, onChanged }: { batches: Batch[]; onChanged: () => void }) {
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Batch | null>(null);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true); setErr(null); setNote(null);
    try { await fn(); if (ok) setNote(ok); onChanged(); return true; }
    catch (e: any) { setErr(e.message); return false; }
    finally { setBusy(false); }
  }

  async function rename(b: Batch) {
    const n = name.trim();
    if (!n) { setErr("Name cannot be blank"); return; }
    if (n === b.name) { setEditId(null); return; }
    const moved = b.registrations ? ` ${b.registrations} registration${b.registrations === 1 ? "" : "s"} updated.` : "";
    if (await run(() => patch(`/batches/${b.id}`, { name: n }), `Renamed “${b.name}” to “${n}”.${moved}`)) setEditId(null);
  }

  function move(i: number, dir: -1 | 1) {
    const ids = batches.map((b) => b.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => put("/batches/order", { ids }));
  }

  return (
    <div data-testid="batch-editor">
      {batches.length === 0 ? <p className="empty">No batches yet — add one below.</p> : null}
      {batches.map((b, i) => (
        <div className="edit-row" key={b.id} data-testid={`batch-row-${b.id}`}>
          {editId === b.id ? (
            <form className="line" onSubmit={(e) => { e.preventDefault(); rename(b); }}>
              <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} aria-label="Batch name" data-testid={`batch-name-input-${b.id}`} />
              <Button small type="submit" loading={busy} testId={`batch-save-btn-${b.id}`}>Save</Button>
              <button type="button" className="chip-btn" onClick={() => { setEditId(null); setErr(null); }}>Cancel</button>
            </form>
          ) : (
            <div className="line">
              <div className="grow">
                <div className="name" data-testid={`batch-name-${b.id}`}>{b.name}</div>
                <div className="small muted">{b.registrations ? `${b.registrations} registration${b.registrations === 1 ? "" : "s"}` : "No registrations yet"}</div>
              </div>
              <button type="button" className="icon-btn" aria-label={`Move ${b.name} up`} disabled={busy || i === 0} onClick={() => move(i, -1)} data-testid={`batch-up-btn-${b.id}`}>↑</button>
              <button type="button" className="icon-btn" aria-label={`Move ${b.name} down`} disabled={busy || i === batches.length - 1} onClick={() => move(i, 1)} data-testid={`batch-down-btn-${b.id}`}>↓</button>
              <button type="button" className="chip-btn" onClick={() => { setEditId(b.id); setName(b.name); setErr(null); }} data-testid={`batch-edit-btn-${b.id}`}>Rename</button>
              <button type="button" className="chip-btn danger" onClick={() => setConfirmDel(b)} data-testid={`batch-delete-btn-${b.id}`}>Delete</button>
            </div>
          )}
        </div>
      ))}
      <form className="row mt-12" onSubmit={(e) => {
        e.preventDefault();
        const n = newName.trim();
        if (!n) return;
        run(() => post("/batches", { name: n }), `Added “${n}”.`).then((ok) => ok && setNewName(""));
      }}>
        <input className="input grow" placeholder="New batch name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} data-testid="new-batch-input" aria-label="New batch name" />
        <Button small type="submit" loading={busy && !editId} testId="add-batch-btn" className="btn-auto">Add</Button>
      </form>
      {err ? <p className="err" data-testid="batch-error">{err}</p> : null}
      {note ? <p className="ok" data-testid="batch-note">{note}</p> : null}

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)}>
        <h2>Delete batch “{confirmDel?.name}”?</h2>
        <p className="sub">
          It disappears from the registration form.{" "}
          {confirmDel?.registrations ? `${confirmDel.registrations} existing registration${confirmDel.registrations === 1 ? "" : "s"} keep “${confirmDel.name}” as their batch.` : "No one has registered with it yet."}
        </p>
        <div className="row mt-16">
          <Button variant="ghost" onClick={() => setConfirmDel(null)} testId="batch-delete-cancel">Cancel</Button>
          <Button variant="danger" loading={busy} testId="batch-delete-confirm" onClick={async () => {
            const b = confirmDel!;
            await run(() => del(`/batches/${b.id}`), `Deleted “${b.name}”.`);
            setConfirmDel(null);
          }}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
