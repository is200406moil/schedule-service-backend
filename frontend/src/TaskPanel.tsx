import { ArrowUpRight, Check, Plus, RefreshCw } from "lucide-react";
import { formatDue, isOverdue } from "./dates";
import type { Loadable, Task } from "./types";

type Props = {
  tasks: Loadable<Task[]>;
  today: string;
  pendingId: number | null;
  onComplete: (id: number) => void;
  onRetry: () => void;
};

export function TaskPanel({ tasks, today, pendingId, onComplete, onRetry }: Props) {
  const active = tasks.kind === "ready"
    ? tasks.data.filter((task) => task.status !== "done").sort((a, b) => {
      if (a.due_at === null) return 1;
      if (b.due_at === null) return -1;
      return a.due_at.localeCompare(b.due_at);
    })
    : [];
  return (
    <section className="tasks-panel" aria-labelledby="tasks-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">В фокусе</p>
          <h2 id="tasks-heading">Ближайшие задачи</h2>
        </div>
        <a className="panel-link" href="/ui/tasks/preview" aria-label="Открыть все задачи"><ArrowUpRight size={19} aria-hidden="true" /></a>
      </div>

      {tasks.kind === "loading" ? (
        <div className="tasks-loading" role="status" aria-label="Загружаем задачи"><span /><span /><span /></div>
      ) : tasks.kind === "error" ? (
        <div className="tasks-empty">
          <h3>Задачи не загрузились</h3>
          <p>Попробуйте ещё раз.</p>
          <button type="button" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" /> Повторить</button>
        </div>
      ) : active.length === 0 ? (
        <div className="tasks-empty">
          <span className="tasks-empty-mark"><Check size={22} aria-hidden="true" /></span>
          <h3>{tasks.data.length === 0 ? "Задач пока нет" : "Все задачи выполнены"}</h3>
          <p>{tasks.data.length === 0 ? "Добавьте первую задачу со сроком или без него." : "Новые задачи появятся здесь."}</p>
          <a href="/ui/tasks/new?return_to=/ui/preview">Создать задачу</a>
        </div>
      ) : (
        <>
          <p className="tasks-count">В работе: {active.length} · сначала ближайшие сроки</p>
          <ul className="task-list">
            {active.slice(0, 5).map((task) => (
              <li className="task-row" key={task.id}>
                <button
                  className="task-complete"
                  type="button"
                  disabled={pendingId !== null}
                  onClick={() => onComplete(task.id)}
                  aria-label={`Отметить задачу «${task.title}» выполненной`}
                ><Check size={16} aria-hidden="true" /></button>
                <a className="task-content" href={`/ui/tasks/${task.id}/edit?return_to=/ui/preview`}>
                  <strong>{task.title}</strong>
                  {task.subject ? <span className="task-subject">{task.subject}</span> : null}
                  <span className={`task-due${isOverdue(task) ? " is-overdue" : ""}`}>{formatDue(task.due_at, today)}</span>
                </a>
              </li>
            ))}
          </ul>
          <a className="task-add-link" href="/ui/tasks/new?return_to=/ui/preview"><Plus size={17} aria-hidden="true" /> Добавить задачу</a>
        </>
      )}
    </section>
  );
}
