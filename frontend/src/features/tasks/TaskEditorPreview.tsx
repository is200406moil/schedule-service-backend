import { CalendarDays, Check, Clock3 } from "lucide-react";
import { formatDate } from "../../shared/dates";
import type { TaskEditorFields } from "./taskEditorModel";

function deadlineLabel(value: string): string {
  if (!value) return "Без срока";
  const [date, time] = value.split("T");
  if (!date || !time) return "Без срока";
  return `${formatDate(date, { day: "numeric", month: "long" })}, ${time} МСК`;
}

export function TaskEditorPreview({ fields }: { fields: TaskEditorFields }) {
  return (
    <aside className="task-editor-preview" aria-label="Предпросмотр задачи">
      <div className="task-editor-preview-head">
        <CalendarDays size={18} aria-hidden="true" />
        <span>В списке задач</span>
      </div>
      <div className={`task-editor-preview-item${fields.status === "done" ? " is-done" : ""}`}>
        <span className="task-editor-preview-check" aria-hidden="true">{fields.status === "done" ? <Check size={17} /> : null}</span>
        <div>
          <strong>{fields.title.trim() || "Название задачи"}</strong>
          {fields.subject.trim() ? <span className="task-editor-preview-subject">{fields.subject.trim()}</span> : null}
          <span className="task-editor-preview-due"><Clock3 size={14} aria-hidden="true" />{deadlineLabel(fields.dueAt)}</span>
        </div>
      </div>
      <p>{fields.dueAt ? "Задача со сроком появится и в календаре." : "Без срока задача останется только в общем списке."}</p>
    </aside>
  );
}
