import { Check, Clock3, Plus, RefreshCw } from "lucide-react";
import { isOverdue, taskDueOn } from "../../shared/dates";
import { calendarHref, editTaskHref } from "../../shared/uiRoutes";
import type { Loadable, Task } from "../../shared/types";
import { moscowTime } from "./calendarDates";

type Props = {
  date: string;
  tasks: Loadable<Task[]>;
  pendingId: number | null;
  onRetry: () => void;
  onToggleTask: (id: number) => void;
  onAddTask: () => void;
};

export function CalendarDayTasks({ date, tasks, pendingId, onRetry, onToggleTask, onAddTask }: Props) {
  const dayTasks = tasks.kind === "ready"
    ? tasks.data.filter((task) => taskDueOn(task, date)).sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.due_at ?? "").localeCompare(b.due_at ?? ""))
    : [];
  const returnTo = calendarHref(date);
  return (
    <section className="calendar-day-section" aria-labelledby="calendar-tasks-title">
      <div className="calendar-section-heading">
        <h3 id="calendar-tasks-title">Задачи</h3>
        <button type="button" onClick={onAddTask} aria-label="Добавить задачу на выбранный день"><Plus size={18} aria-hidden="true" /></button>
      </div>
      {tasks.kind === "loading" ? (
        <div className="calendar-skeleton" role="status" aria-label="Загружаем задачи"><span /><span /></div>
      ) : tasks.kind === "error" ? (
        <div className="calendar-inline-empty"><p>Не удалось загрузить задачи.</p><button type="button" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" /> Повторить</button></div>
      ) : dayTasks.length === 0 ? (
        <div className="calendar-inline-empty"><Clock3 size={22} aria-hidden="true" /><p>На этот день задач нет.</p><button type="button" onClick={onAddTask}>Добавить задачу</button></div>
      ) : (
        <ul className="calendar-task-list">
          {dayTasks.map((task) => (
            <li className={`calendar-task${task.status === "done" ? " is-done" : ""}`} key={task.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={task.status === "done"}
                className={task.status === "done" ? "calendar-task-done" : "calendar-task-check"}
                disabled={pendingId !== null}
                onClick={() => onToggleTask(task.id)}
                aria-label={`Задача «${task.title}»`}
              ><Check size={14} aria-hidden="true" /></button>
              <a href={editTaskHref(task.id, returnTo)}>
                <strong>{task.title}</strong>
                <span>{moscowTime(task.due_at ?? "")}{task.subject ? ` · ${task.subject}` : ""}{isOverdue(task) ? " · срок прошёл" : ""}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
