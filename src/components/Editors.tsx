import { ArrowDown, ArrowUp, Check, Pencil, Plus, Power, PowerOff, Trash2, X } from "lucide-react";
import { useState } from "react";
import { type Batch, type Branch, del, patch, post, put } from "../api";
import { Alert, Button, IconButton, Modal, Pill } from "./ui";

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
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) save({ name: name.trim(), active: branch.active }); }}>
          <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} data-testid={`branch-name-input-${branch.id}`} aria-label="Branch name" />
          <Button small block={false} type="submit" icon={<Check />} loading={busy} testId={`branch-save-btn-${branch.id}`}>Save</Button>
          <IconButton small label="Cancel" icon={<X />} onClick={() => { setEditing(false); setErr(null); setName(branch.name); }} testId={`branch-cancel-btn-${branch.id}`} />
        </form>
      ) : (
        <>
          <div className="grow">
            <div className="name" style={{ color: branch.active ? undefined : "var(--text-2)" }}>{branch.name}</div>
            <div className="mt-4"><Pill label={branch.active ? "Open for registration" : "Switched off"} tone={branch.active ? "success" : "muted"} /></div>
          </div>
          <IconButton small label={`Rename ${branch.name}`} icon={<Pencil />} onClick={() => { setName(branch.name); setEditing(true); }} testId={`branch-edit-btn-${branch.id}`} />
          <IconButton small variant={branch.active ? "danger" : "success"} label={branch.active ? `Switch off ${branch.name}` : `Switch on ${branch.name}`} icon={branch.active ? <PowerOff /> : <Power />}
            loading={busy} onClick={() => save({ name: branch.name, active: !branch.active })} testId={`branch-toggle-btn-${branch.id}`} />
        </>
      )}
      {err ? <div style={{ width: "100%" }}><Alert tone="error">{err}</Alert></div> : null}
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
      <div className="list">
        {batches.length === 0 ? <p className="empty">No batches yet — add one below.</p> : null}
        {batches.map((b, i) => (
          <div className="edit-row" key={b.id} data-testid={`batch-row-${b.id}`}>
            {editId === b.id ? (
              <form onSubmit={(e) => { e.preventDefault(); rename(b); }}>
                <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} aria-label="Batch name" data-testid={`batch-name-input-${b.id}`} />
                <Button small block={false} type="submit" icon={<Check />} loading={busy} testId={`batch-save-btn-${b.id}`}>Save</Button>
                <IconButton small label="Cancel" icon={<X />} onClick={() => { setEditId(null); setErr(null); }} />
              </form>
            ) : (
              <>
                <div className="grow">
                  <div className="name" data-testid={`batch-name-${b.id}`}>{b.name}</div>
                  <div className="small muted">{b.registrations ? `${b.registrations} registration${b.registrations === 1 ? "" : "s"}` : "No registrations yet"}</div>
                </div>
                <IconButton small variant="ghost" label={`Move ${b.name} up`} icon={<ArrowUp />} disabled={busy || i === 0} onClick={() => move(i, -1)} testId={`batch-up-btn-${b.id}`} />
                <IconButton small variant="ghost" label={`Move ${b.name} down`} icon={<ArrowDown />} disabled={busy || i === batches.length - 1} onClick={() => move(i, 1)} testId={`batch-down-btn-${b.id}`} />
                <IconButton small label={`Rename ${b.name}`} icon={<Pencil />} onClick={() => { setEditId(b.id); setName(b.name); setErr(null); }} testId={`batch-edit-btn-${b.id}`} />
                <IconButton small variant="danger" label={`Delete ${b.name}`} icon={<Trash2 />} onClick={() => setConfirmDel(b)} testId={`batch-delete-btn-${b.id}`} />
              </>
            )}
          </div>
        ))}
        <form className="add-row" onSubmit={(e) => {
          e.preventDefault();
          const n = newName.trim();
          if (!n) return;
          run(() => post("/batches", { name: n }), `Added “${n}”.`).then((ok) => ok && setNewName(""));
        }}>
          <input className="input" style={{ flex: 1, minWidth: 0 }} placeholder="New batch name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} data-testid="new-batch-input" aria-label="New batch name" />
          <Button small block={false} type="submit" icon={<Plus />} loading={busy && !editId} testId="add-batch-btn">Add</Button>
        </form>
      </div>
      {err ? <Alert tone="error" testId="batch-error">{err}</Alert> : null}
      {note ? <Alert tone="success" testId="batch-note">{note}</Alert> : null}

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)}>
        <div className="modal-ico"><Trash2 /></div>
        <h2>Delete batch “{confirmDel?.name}”?</h2>
        <p className="sub">
          It disappears from the registration form.{" "}
          {confirmDel?.registrations ? `${confirmDel.registrations} existing registration${confirmDel.registrations === 1 ? "" : "s"} keep “${confirmDel.name}” as their batch.` : "No one has registered with it yet."}
        </p>
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => setConfirmDel(null)} testId="batch-delete-cancel">Cancel</Button>
          <Button variant="danger" icon={<Trash2 />} loading={busy} testId="batch-delete-confirm" onClick={async () => {
            const b = confirmDel!;
            await run(() => del(`/batches/${b.id}`), `Deleted “${b.name}”.`);
            setConfirmDel(null);
          }}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
