import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ApiError, getSchedule, UnauthorizedError } from "./api";
import { TaskFormFields } from "./TaskFormFields";
import { blankTaskFields, newTaskPayload, subjectNames } from "./taskEditorModel";
import { sheetDragDistance, shouldDismissSheet, SHEET_MEDIA_QUERY } from "./sheetGesture";
import type { GesturePoint } from "./sheetGesture";
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
  const closeButton = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{ pointerId: number; start: GesturePoint; dragging: boolean } | null>(null);
  const wasConfirmingClose = useRef(false);
  const pendingTitleFocus = useRef(false);
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
      wasConfirmingClose.current = false;
      pendingTitleFocus.current = false;
      return;
    }
    setFields(blankTaskFields(initialSubject, initialDueAt));
    setTitleError("");
    setDueError("");
    setSaveError("");
    setConfirmClose(false);
    wasConfirmingClose.current = false;
    pendingTitleFocus.current = false;
    resetGesture();
    dialog.current?.removeAttribute("data-entered");
    const previousFocus = document.activeElement;
    if (!dialog.current?.open) dialog.current?.showModal();
    if (window.matchMedia(SHEET_MEDIA_QUERY).matches) closeButton.current?.focus({ preventScroll: true });
    else if (titleInput.current) titleInput.current.focus();
    else pendingTitleFocus.current = true;
    const previousOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const viewport = window.visualViewport;
    const resize = () => {
      if (!viewport || !dialog.current) return;
      dialog.current.style.setProperty("--sheet-available-height", `${viewport.height}px`);
      dialog.current.style.setProperty("--sheet-bottom-offset", `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      resetGesture();
      dialog.current?.close();
      document.documentElement.style.overflow = previousOverflow;
      document.body.style.overflow = previousBodyOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
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
    else if (wasConfirmingClose.current || pendingTitleFocus.current) {
      titleInput.current?.focus();
      pendingTitleFocus.current = false;
    }
    wasConfirmingClose.current = confirmClose;
  }, [confirmClose]);

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
    resetGesture();
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  function resetGesture() {
    gesture.current = null;
    dialog.current?.removeAttribute("data-dragging");
    dialog.current?.style.setProperty("--sheet-drag-y", "0px");
  }

  function startGesture(event: React.PointerEvent<HTMLDivElement>) {
    if (submitting.current || confirmClose || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (!window.matchMedia(SHEET_MEDIA_QUERY).matches || (event.target instanceof Element && event.target.closest("button"))) return;
    gesture.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveGesture(event: React.PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (submitting.current || !window.matchMedia(SHEET_MEDIA_QUERY).matches) { resetGesture(); return; }
    const distance = sheetDragDistance(active.start, { x: event.clientX, y: event.clientY });
    if (distance && !active.dragging) {
      active.dragging = true;
      dialog.current?.setAttribute("data-entered", "true");
      dialog.current?.setAttribute("data-dragging", "true");
    }
    if (active.dragging) dialog.current?.style.setProperty("--sheet-drag-y", `${distance}px`);
  }

  function endGesture(event: React.PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dismiss = window.matchMedia(SHEET_MEDIA_QUERY).matches && shouldDismissSheet(active.start, { x: event.clientX, y: event.clientY });
    resetGesture();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (dismiss) requestClose();
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
    <dialog ref={dialog} className="task-create-dialog" aria-labelledby="task-create-heading" aria-describedby="task-create-description" onAnimationEnd={(event) => { if (event.target === event.currentTarget) event.currentTarget.setAttribute("data-entered", "true"); }} onCancel={(event) => { event.preventDefault(); requestClose(); }}>
      <div className="task-create-top" onPointerDown={startGesture} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={resetGesture} onLostPointerCapture={resetGesture}>
        <div className="task-create-handle" aria-hidden="true"><span /></div>
        <div className="task-create-head">
          <div>
            <h2 id="task-create-heading">{confirmClose ? "Закрыть без сохранения?" : "Новая задача"}</h2>
            <p id="task-create-description">{confirmClose ? "Заполненные поля будут очищены. Задача ещё не создана." : "Обязательно только название. Остальное — по желанию."}</p>
          </div>
          <button ref={closeButton} type="button" className="task-create-close" disabled={saving} onClick={requestClose} aria-label="Закрыть форму"><X size={20} aria-hidden="true" /></button>
        </div>
      </div>
      {confirmClose ? (
        <div className="task-create-actions task-create-discard-actions">
          <button ref={keepEditingButton} type="button" className="task-create-secondary" onClick={() => { setConfirmClose(false); }}>Продолжить</button>
          <button type="button" className="task-create-discard" onClick={onClose}>Закрыть без сохранения</button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate aria-busy={saving}>
          <div className="task-create-body">
            <TaskFormFields fields={fields} onChange={change} disabled={saving} subjects={subjects ?? scheduleSubjects} titleError={titleError} dueError={dueError} titleRef={titleInput} dueRef={dueInput} idPrefix="task-create" compact />
            {saveError ? <p className="task-create-save-error" role="alert">{saveError}</p> : null}
          </div>
          <div className="task-create-actions">
            <button type="button" className="task-create-secondary" disabled={saving} onClick={requestClose}>Отмена</button>
            <button type="submit" className="task-create-save" disabled={saving}>{saving ? "Создаём…" : "Создать задачу"}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
