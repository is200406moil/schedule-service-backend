import { useEffect, useRef, useState } from "react";
import type { Task } from "./types";

type Props = {
  task: Task | null;
  onClose: () => void;
  onDelete: (id: number) => Promise<void>;
};

export function TaskDeleteDialog({ task, onClose, onDelete }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!task) {
      if (dialog.current?.open) dialog.current.close();
      return;
    }
    setError("");
    if (!dialog.current?.open) dialog.current?.showModal();
    cancel.current?.focus();
  }, [task]);

  async function confirmDelete() {
    if (!task || saving) return;
    setSaving(true);
    setError("");
    try {
      await onDelete(task.id);
      dialog.current?.close();
    } catch {
      setError("Не удалось удалить задачу. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog className="tasks-delete-dialog" ref={dialog} onClose={onClose} aria-labelledby="tasks-delete-title" aria-describedby="tasks-delete-description">
      <h2 id="tasks-delete-title">Удалить задачу?</h2>
      <p id="tasks-delete-description">Задачу «{task?.title}» нельзя будет восстановить.</p>
      {error ? <p className="tasks-delete-error" role="alert">{error}</p> : null}
      <div className="tasks-delete-actions">
        <button type="button" ref={cancel} className="tasks-delete-cancel" disabled={saving} onClick={() => dialog.current?.close()}>Отмена</button>
        <button type="button" className="tasks-delete-confirm" disabled={saving} onClick={confirmDelete}>{saving ? "Удаляем…" : "Удалить"}</button>
      </div>
    </dialog>
  );
}
