import { useEffect, useRef, useState } from "react";
import type { Task } from "../../shared/types";

type Props = {
  task: Task | null;
  onClose: () => void;
  onDelete: (id: number) => Promise<void>;
};

export function TaskDeleteDialog({ task, onClose, onDelete }: Props) {
  return task ? <DeleteConfirmation key={task.id} task={task} onClose={onClose} onDelete={onDelete} /> : null;
}

function DeleteConfirmation({ task, onClose, onDelete }: Props & { task: Task }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const active = useRef(false);
  const operation = useRef<object | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const currentDialog = dialog.current;
    active.current = true;
    if (!currentDialog?.open) currentDialog?.showModal();
    cancel.current?.focus();
    return () => {
      active.current = false;
      operation.current = null;
      if (currentDialog?.open) currentDialog.close();
    };
  }, []);

  async function confirmDelete() {
    if (!active.current || operation.current) return;
    const currentOperation = {};
    operation.current = currentOperation;
    const currentDialog = dialog.current;
    setSaving(true);
    setError("");
    try {
      await onDelete(task.id);
      if (operation.current === currentOperation) currentDialog?.close();
    } catch {
      if (operation.current === currentOperation) setError("Не удалось удалить задачу. Попробуйте ещё раз.");
    } finally {
      if (operation.current === currentOperation) {
        operation.current = null;
        setSaving(false);
      }
    }
  }

  return (
    <dialog className="tasks-delete-dialog" ref={dialog} onClose={(event) => { if (active.current && !event.currentTarget.open) onClose(); }} onCancel={(event) => { if (operation.current) event.preventDefault(); }} aria-labelledby="tasks-delete-title" aria-describedby="tasks-delete-description" aria-busy={saving}>
      <h2 id="tasks-delete-title">Удалить задачу?</h2>
      <p id="tasks-delete-description">Задачу «{task.title}» нельзя будет восстановить.</p>
      {error ? <p className="tasks-delete-error" role="alert">{error}</p> : null}
      <div className="tasks-delete-actions">
        <button type="button" ref={cancel} className="tasks-delete-cancel" disabled={saving} onClick={() => { if (!operation.current) dialog.current?.close(); }}>Отмена</button>
        <button type="button" className="tasks-delete-confirm" disabled={saving} onClick={confirmDelete}>{saving ? "Удаляем…" : "Удалить"}</button>
      </div>
    </dialog>
  );
}
