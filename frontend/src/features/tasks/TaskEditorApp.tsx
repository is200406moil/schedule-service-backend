import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { formatDate } from "../../shared/dates";
import { SessionEnded } from "../../shared/SessionEnded";
import { Shell } from "../../shared/Shell";
import { TaskEditorForm } from "./TaskEditorForm";
import { TaskEditorLoadState } from "./TaskEditorLoadState";
import { useTaskEditorData } from "./useTaskEditorData";
import type { TaskEditorBootData } from "../../shared/types";

export function TaskEditorApp({ boot }: { boot: TaskEditorBootData }) {
  const { task, subjects, retry, markMissing } = useTaskEditorData(boot);
  const [sessionExpired, setSessionExpired] = useState(false);
  const isEditing = boot.taskId !== null;

  if (task.kind === "session-expired" || sessionExpired) return <SessionEnded user={boot} section="tasks" />;

  return (
    <Shell user={boot} section="tasks" hideMobileAdd>
      <div className="workspace-inner task-editor-view">
        <div className="page-topline">
          <span>{formatDate(boot.today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
        </div>
        <a className="task-editor-back" href={boot.returnTo}><ArrowLeft size={18} aria-hidden="true" /> Назад</a>
        <header className="task-editor-page-head">
          <h1>{isEditing ? "Редактировать задачу" : "Новая задача"}</h1>
          <p>{isEditing ? "Измените детали или отметьте задачу выполненной." : "Название обязательно. Остальное можно добавить сейчас или позже."}</p>
        </header>

        {task.kind === "ready" ? (
          <TaskEditorForm boot={boot} initialFields={task.fields} subjects={subjects} onSessionExpired={() => setSessionExpired(true)} onMissing={markMissing} />
        ) : (
          <TaskEditorLoadState kind={task.kind} returnTo={boot.returnTo} onRetry={retry} />
        )}
      </div>
    </Shell>
  );
}
