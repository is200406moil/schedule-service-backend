import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { ApiError, createTask, getSchedule, getTask, UnauthorizedError, updateTask } from "./api";
import { formatDate } from "./dates";
import { SessionEnded } from "./SessionEnded";
import { Shell } from "./Shell";
import { TaskEditorPreview } from "./TaskEditorPreview";
import { TaskFormFields } from "./TaskFormFields";
import { blankTaskFields, fieldsFromTask, newTaskPayload, subjectNames, taskPatchPayload } from "./taskEditorModel";
import type { TaskEditorFields } from "./taskEditorModel";
import type { TaskEditorBootData } from "./types";

type LoadingState = "ready" | "loading" | "missing" | "error";

export function TaskEditorApp({ boot }: { boot: TaskEditorBootData }) {
  const initial = blankTaskFields(boot.initialSubject ?? "");
  const [fields, setFields] = useState<TaskEditorFields>(initial);
  const [baseline, setBaseline] = useState<TaskEditorFields>(initial);
  const [loading, setLoading] = useState<LoadingState>(boot.taskId === null ? "ready" : "loading");
  const [retry, setRetry] = useState(0);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [titleError, setTitleError] = useState("");
  const [dueError, setDueError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const dueInput = useRef<HTMLInputElement>(null);
  const saved = useRef(false);
  const isEditing = boot.taskId !== null;
  const dirty = fields.title !== baseline.title || fields.body !== baseline.body || fields.dueAt !== baseline.dueAt || fields.subject !== baseline.subject || fields.status !== baseline.status;

  useEffect(() => {
    if (boot.taskId === null) return;
    const controller = new AbortController();
    setLoading("loading");
    getTask(boot.taskId, controller.signal)
      .then((task) => {
        const values = fieldsFromTask(task);
        if (boot.initialSubject?.trim()) values.subject = boot.initialSubject;
        setFields(values);
        setBaseline(values);
        setLoading("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof UnauthorizedError) setSessionExpired(true);
        else setLoading(error instanceof ApiError && error.status === 404 ? "missing" : "error");
      });
    return () => controller.abort();
  }, [boot.taskId, boot.initialSubject, retry]);

  useEffect(() => {
    if (!boot.group) return;
    const controller = new AbortController();
    getSchedule(boot.group, controller.signal)
      .then((schedule) => setSubjects(subjectNames(schedule)))
      .catch(() => { /* The field remains free text when the schedule is unavailable. */ });
    return () => controller.abort();
  }, [boot.group]);

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
    setFields((current) => ({ ...current, [key]: value }));
    if (key === "title") setTitleError("");
    if (key === "dueAt") setDueError("");
    if (saveError) setSaveError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading !== "ready") return;
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
    setSaving(true);
    setSaveError("");
    try {
      if (boot.taskId === null) {
        await createTask(newTaskPayload(fields), boot.csrfToken);
      } else {
        await updateTask(boot.taskId, taskPatchPayload(fields, baseline), boot.csrfToken);
      }
      saved.current = true;
      window.location.assign(boot.returnTo);
    } catch (error) {
      if (error instanceof UnauthorizedError) setSessionExpired(true);
      else if (error instanceof ApiError && error.status === 404) setLoading("missing");
      else if (error instanceof ApiError && error.status === 403) setSaveError("Не удалось подтвердить запрос. Обновите страницу и повторите.");
      else if (error instanceof ApiError && error.status === 422) setSaveError("Проверьте название, срок и длину заполненных полей.");
      else setSaveError("Не удалось сохранить задачу. Попробуйте ещё раз.");
      setSaving(false);
    }
  }

  if (sessionExpired) return <SessionEnded user={boot} section="tasks" />;

  const oldEditor = boot.taskId === null ? "/ui/tasks/new" : `/ui/tasks/${boot.taskId}/edit`;
  const oldParams = new URLSearchParams({ return_to: boot.returnTo });
  if (boot.initialSubject?.trim()) oldParams.set("subject", boot.initialSubject);
  const oldHref = `${oldEditor}?${oldParams}`;

  return (
    <Shell user={boot} section="tasks" hideMobileAdd>
      <div className="workspace-inner task-editor-view">
        <div className="page-topline">
          <span>{formatDate(boot.today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
          <a className="old-version-link" href={oldHref}>Прежняя форма <ArrowUpRight size={15} aria-hidden="true" /></a>
        </div>
        <a className="task-editor-back" href={boot.returnTo}><ArrowLeft size={18} aria-hidden="true" /> Назад</a>
        <header className="task-editor-page-head">
          <h1>{isEditing ? "Редактировать задачу" : "Новая задача"}</h1>
          <p>{isEditing ? "Измените детали или отметьте задачу выполненной." : "Название обязательно. Остальное можно добавить сейчас или позже."}</p>
        </header>

        {loading === "loading" ? (
          <div className="task-editor-loading" role="status" aria-label="Загружаем задачу"><span /><span /><span /></div>
        ) : loading === "missing" || loading === "error" ? (
          <div className="task-editor-load-error" role="alert">
            <h2>{loading === "missing" ? "Задача не найдена" : "Не удалось загрузить задачу"}</h2>
            <p>{loading === "missing" ? "Возможно, её удалили или у вас нет к ней доступа." : "Проверьте соединение и попробуйте ещё раз."}</p>
            <div>
              <a href={boot.returnTo}>Вернуться</a>
              {loading === "error" ? <button type="button" onClick={() => setRetry((value) => value + 1)}>Повторить</button> : null}
            </div>
          </div>
        ) : (
          <div className="task-editor-layout">
            <form className="task-editor-form" onSubmit={submit} noValidate>
              <TaskFormFields fields={fields} onChange={change} disabled={saving} subjects={subjects} titleError={titleError} dueError={dueError} titleRef={titleInput} dueRef={dueInput} idPrefix="task-editor" autoFocus={!isEditing} />

              {isEditing ? (
                <label className="task-editor-status" htmlFor="task-editor-done">
                  <span><strong>Задача выполнена</strong><small>Можно вернуть её в работу позже.</small></span>
                  <input id="task-editor-done" type="checkbox" disabled={saving} checked={fields.status === "done"} onChange={(event) => change("status", event.target.checked ? "done" : "todo")} />
                </label>
              ) : null}

              {saveError ? <p className="task-editor-save-error" role="alert">{saveError}</p> : null}
              <div className="task-editor-actions">
                <a href={boot.returnTo}>Отмена</a>
                <button type="submit" disabled={saving}>{saving ? "Сохраняем…" : isEditing ? "Сохранить изменения" : "Создать задачу"}</button>
              </div>
            </form>
            <TaskEditorPreview fields={fields} />
          </div>
        )}
      </div>
    </Shell>
  );
}
