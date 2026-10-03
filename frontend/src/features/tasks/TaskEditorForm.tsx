import { TaskEditorPreview } from "./TaskEditorPreview";
import { TaskFormFields } from "./TaskFormFields";
import { useTaskEditorForm } from "./useTaskEditorForm";
import type { TaskEditorFormOptions } from "./useTaskEditorForm";

type Props = TaskEditorFormOptions & { subjects: string[] };

export function TaskEditorForm({ subjects, ...options }: Props) {
  const { fields, change, submit, saving, titleError, dueError, saveError, titleInput, dueInput } = useTaskEditorForm(options);
  const isEditing = options.boot.taskId !== null;

  return (
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
          <a href={options.boot.returnTo}>Отмена</a>
          <button type="submit" disabled={saving}>{saving ? "Сохраняем…" : isEditing ? "Сохранить изменения" : "Создать задачу"}</button>
        </div>
      </form>
      <TaskEditorPreview fields={fields} />
    </div>
  );
}
