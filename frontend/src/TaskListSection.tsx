import { ArrowUpRight, Check, Trash2 } from "lucide-react";
import { formatDue, isOverdue } from "./dates";
import type { Task } from "./types";
import type { TaskSection } from "./taskView";

type Props = {
  section: TaskSection;
  today: string;
  returnTo: string;
  pendingId: number | null;
  onToggle: (task: Task) => void;
  onRequestDelete: (task: Task) => void;
};

export function TaskListSection({ section, today, returnTo, pendingId, onToggle, onRequestDelete }: Props) {
  return (
    <section className={`tasks-group is-${section.key}`} aria-labelledby={`tasks-group-${section.key}`}>
      <div className="tasks-group-heading">
        <div>
          <h2 id={`tasks-group-${section.key}`}>{section.title}</h2>
          <p>{section.subtitle}</p>
        </div>
        <span aria-hidden="true">{section.items.length}</span>
      </div>
      <ul className="tasks-ledger">
        {section.items.map((task) => {
          const overdue = isOverdue(task);
          const editHref = `/ui/tasks/${task.id}/edit/preview?return_to=${encodeURIComponent(returnTo)}`;
          return (
            <li className={`tasks-ledger-row${task.status === "done" ? " is-done" : ""}${overdue ? " is-overdue" : ""}`} key={task.id}>
              <button
                type="button"
                className="tasks-state"
                role="checkbox"
                aria-checked={task.status === "done"}
                aria-label={`Задача «${task.title}»`}
                disabled={pendingId !== null}
                onClick={() => onToggle(task)}
              ><Check size={17} aria-hidden="true" /></button>
              <div className="tasks-ledger-main">
                <a className="tasks-ledger-title" href={editHref}>{task.title}<ArrowUpRight size={15} aria-hidden="true" /></a>
                {task.body ? <p className="tasks-ledger-body">{task.body}</p> : null}
                <div className="tasks-ledger-meta">
                  {task.subject ? <span className="tasks-subject">{task.subject}</span> : null}
                  <span className="tasks-due">{formatDue(task.due_at, today)}</span>
                  {overdue ? <span className="tasks-overdue-label">Срок прошёл</span> : null}
                </div>
              </div>
              <button type="button" className="tasks-delete-trigger" aria-label={`Удалить задачу «${task.title}»`} onClick={() => onRequestDelete(task)}><Trash2 size={18} aria-hidden="true" /></button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
