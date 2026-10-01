import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ApiError, getSchedule, UnauthorizedError } from "./api";
import { TaskFormFields } from "./TaskFormFields";
import { blankTaskFields, newTaskPayload, subjectNames } from "./taskEditorModel";
import type { TaskEditorFields } from "./taskEditorModel";
import type { NewTask } from "./types";
import "./task-create-dialog.css";

type Props = {
  open: boolean;
  group: string;
  initialDueAt?: string;
  initialSubject?: string;
  subjects?: string[];
  onClose: () => void;
  onCreate: (data: NewTask) => Promise<void>;
};

export function TaskCreateDialog({ open, group, initialDueAt = "", initialSubject = "", subjects, onClose, onCreate }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const dueInput = useRef<HTMLInputElement>(null);
  const keepEditingButton = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [fields, setFields] = useState(() => blankTaskFields(initialSubject, initialDueAt));
  const [scheduleSubjects, setScheduleSubjects] = useState<string[]>([]);
  const [titleError, setTitleError] = useState("");
  const [dueError, setDueError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty = Boolean(fields.title || fields.body || fields.dueAt !== initialDueAt || fields.subject !== initialSubject.slice(0, 255));

  useEffect(() => {
    if (!open) {
      dialog.current?.close();
      return;
    }
    setFields(blankTaskFields(initialSubject, initialDueAt));
    setTitleError("");
    setDueError("");
    setSaveError("");
    setConfirmClose(false);
    if (!dialog.current?.open) dialog.current?.showModal();
    titleInput.current?.focus();
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.documentElement.style.overflow = previousOverflow; };
  }, [open, initialDueAt, initialSubject]);

  useEffect(() => {
    if (!open || subjects !== undefined || !group) return;
    const controller = new AbortController();
    getSchedule(group, controller.signal)
      .then((schedule) => setScheduleSubjects(subjectNames(schedule)))
      .catch(() => { /* Subject remains free text if suggestions are unavailable. */ });
    return () => controller.abort();
  }, [open, group, subjects]);

  useEffect(() => {
    if (confirmClose) keepEditingButton.current?.focus();
    else if (open) titleInput.current?.focus();
  }, [confirmClose, open]);

  useEffect(() => {
    if (!open || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open, dirty]);

  function requestClose() {
    if (submitting.current) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  function change<K extends keyof TaskEditorFields>(key: K, value: TaskEditorFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
    if (key === "title") setTitleError("");
    if (key === "dueAt") setDueError("");
    setSaveError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!fields.title.trim()) {
      setTitleError("Напишите название задачи.");
      titleInput.current?.focus();
      return;
    }
    if (dueInput.current && !dueInput.current.validity.valid) {
      setDueError("Проверьте дату и время.");
      dueInput.current.focus();
      return;
    }
    submitting.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await onCreate(newTaskPayload(fields));
      onClose();
    } catch (error) {
      if (error instanceof UnauthorizedError) return;
      if (error instanceof ApiError && error.status === 403) setSaveError("Не удалось подтвердить запрос. Обновите страницу и повторите.");
      else if (error instanceof ApiError && error.status === 422) setSaveError("Проверьте название, срок и длину заполненных полей.");
      else setSaveError("Не удалось создать задачу. Попробуйте ещё раз.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialog} className="task-create-dialog" aria-labelledby="task-create-heading" aria-describedby="task-create-description" onCancel={(event) => { event.preventDefault(); requestClose(); }}>
      <div className="task-create-head">
        <div>
          <h2 id="task-create-heading">{confirmClose ? "Закрыть без сохранения?" : "Новая задача"}</h2>
          <p id="task-create-description">{confirmClose ? "Заполненные поля будут очищены. Задача ещё не создана." : "Обязательно только название. Остальное — по желанию."}</p>
        </div>
        <button type="button" className="task-create-close" disabled={saving} onClick={requestClose} aria-label="Закрыть форму"><X size={20} aria-hidden="true" /></button>
      </div>
      {confirmClose ? (
        <div className="task-create-actions task-create-discard-actions">
          <button ref={keepEditingButton} type="button" className="task-create-secondary" onClick={() => { setConfirmClose(false); }}>Продолжить</button>
          <button type="button" className="task-create-discard" onClick={onClose}>Закрыть без сохранения</button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate aria-busy={saving}>
          <TaskFormFields fields={fields} onChange={change} disabled={saving} subjects={subjects ?? scheduleSubjects} titleError={titleError} dueError={dueError} titleRef={titleInput} dueRef={dueInput} idPrefix="task-create" compact />
          {saveError ? <p className="task-create-save-error" role="alert">{saveError}</p> : null}
          <div className="task-create-actions">
            <button type="button" className="task-create-secondary" disabled={saving} onClick={requestClose}>Отмена</button>
            <button type="submit" className="task-create-save" disabled={saving}>{saving ? "Создаём…" : "Создать задачу"}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
