import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, createTask, UnauthorizedError, updateTask } from "../../shared/api";
import { newTaskPayload, taskPatchPayload } from "./taskEditorModel";
import type { TaskEditorFields } from "./taskEditorModel";
import type { TaskEditorBootData } from "../../shared/types";

export type TaskEditorFormOptions = {
  boot: TaskEditorBootData;
  initialFields: TaskEditorFields;
  onSessionExpired: () => void;
  onMissing: () => void;
};

function saveErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return "Не удалось подтвердить запрос. Обновите страницу и повторите.";
  if (error instanceof ApiError && error.status === 422) return "Проверьте название, срок и длину заполненных полей.";
  return "Не удалось сохранить задачу. Попробуйте ещё раз.";
}

export function useTaskEditorForm({ boot, initialFields, onSessionExpired, onMissing }: TaskEditorFormOptions) {
  const [fields, setFields] = useState(initialFields);
  const [titleError, setTitleError] = useState("");
  const [dueError, setDueError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const dueInput = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const saved = useRef(false);
  const dirty = fields.title !== initialFields.title || fields.body !== initialFields.body || fields.dueAt !== initialFields.dueAt || fields.subject !== initialFields.subject || fields.status !== initialFields.status;

  useEffect(() => {
    if (!dirty || saved.current) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (saved.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change<K extends keyof TaskEditorFields>(key: K, value: TaskEditorFields[K]) {
    setFields(current => ({ ...current, [key]: value }));
    if (key === "title") setTitleError("");
    if (key === "dueAt") setDueError("");
    if (saveError) setSaveError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
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
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      if (boot.taskId === null) {
        await createTask(newTaskPayload(fields), boot.csrfToken);
      } else {
        await updateTask(boot.taskId, taskPatchPayload(fields, initialFields), boot.csrfToken);
      }
      saved.current = true;
      window.location.assign(boot.returnTo);
    } catch (error) {
      if (error instanceof UnauthorizedError) onSessionExpired();
      else if (error instanceof ApiError && error.status === 404) onMissing();
      else setSaveError(saveErrorMessage(error));
    } finally {
      if (!saved.current) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }

  return { fields, change, submit, saving, titleError, dueError, saveError, titleInput, dueInput };
}
