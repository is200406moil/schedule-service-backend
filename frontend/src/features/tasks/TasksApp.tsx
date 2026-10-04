import { useEffect, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { createTask, deleteTask, getTasks, setTaskStatus, UnauthorizedError } from "../../shared/api";
import { formatDate, taskWord } from "../../shared/dates";
import { Shell } from "../../shared/Shell";
import { SessionEnded } from "../../shared/SessionEnded";
import { taskListHref } from "../../shared/uiRoutes";
import { TaskDeleteDialog } from "./TaskDeleteDialog";
import { TaskCreateDialog } from "./TaskCreateDialog";
import { TaskListSection } from "./TaskListSection";
import { deriveTaskView, normalizeTaskFilter } from "./taskView";
import type { TaskFilter } from "./taskView";
import type { Loadable, NewTask, Task, TasksBootData } from "../../shared/types";

const filters: ReadonlyArray<{ key: TaskFilter; label: string }> = [
  { key: "all", label: "Все" },
  { key: "active", label: "В работе" },
  { key: "today", label: "Сегодня" },
  { key: "overdue", label: "Просрочено" },
  { key: "done", label: "Выполнено" },
];

const emptyCopy: Record<TaskFilter, { title: string; detail: string }> = {
  all: { title: "Задач пока нет", detail: "Добавьте задачу. Если укажете срок, она появится и в календаре." },
  active: { title: "Всё сделано", detail: "Сейчас нет задач в работе." },
  today: { title: "На сегодня задач нет", detail: "Посмотрите, что запланировано на другие дни." },
  overdue: { title: "Просроченных задач нет", detail: "Здесь появятся открытые задачи с прошедшим сроком." },
  done: { title: "Выполненных задач пока нет", detail: "Отмеченные задачи появятся здесь." },
};

export function TasksApp({ boot }: { boot: TasksBootData }) {
  const [tasks, setTasks] = useState<Loadable<Task[]>>({ kind: "loading" });
  const [retry, setRetry] = useState(0);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [notice, setNotice] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState(() => normalizeTaskFilter(boot.initialFilter));

  useEffect(() => {
    const controller = new AbortController();
    setTasks({ kind: "loading" });
    getTasks(controller.signal)
      .then((data) => setTasks({ kind: "ready", data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof UnauthorizedError) setSessionExpired(true);
        else setTasks({ kind: "error" });
      });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const taskList = tasks.kind === "ready" ? tasks.data : [];
  const view = deriveTaskView(taskList, filter, boot.today);
  const returnTo = taskListHref(filter);

  async function handleCreate(data: NewTask) {
    try {
      const created = await createTask(data, boot.csrfToken);
      setTasks((current) => current.kind === "ready"
        ? { kind: "ready", data: [...current.data, created] }
        : current);
      if (tasks.kind !== "ready") setRetry((value) => value + 1);
      const visible = deriveTaskView([created], filter, boot.today).sections.length > 0;
      if (!visible) {
        setFilter("all");
        window.history.replaceState(window.history.state, "", taskListHref("all"));
      }
      setNotice(visible ? "Задача добавлена" : "Задача добавлена. Открыт список всех задач.");
    } catch (error) {
      if (error instanceof UnauthorizedError) setSessionExpired(true);
      throw error;
    }
  }

  async function handleToggle(task: Task) {
    if (pendingId !== null) return;
    setPendingId(task.id);
    const status = task.status === "done" ? "todo" : "done";
    try {
      await setTaskStatus(task.id, status, boot.csrfToken);
      setTasks((current) => current.kind === "ready"
        ? { kind: "ready", data: current.data.map((item) => item.id === task.id ? { ...item, status, updated_at: new Date().toISOString() } : item) }
        : current);
      setNotice(status === "done" ? "Задача выполнена" : "Задача снова в работе");
    } catch (error) {
      if (error instanceof UnauthorizedError) setSessionExpired(true);
      else setNotice("Не получилось изменить задачу. Попробуйте ещё раз.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteTask(id, boot.csrfToken);
      setTasks((current) => current.kind === "ready"
        ? { kind: "ready", data: current.data.filter((task) => task.id !== id) }
        : current);
      setNotice("Задача удалена");
    } catch (error) {
      if (error instanceof UnauthorizedError) setSessionExpired(true);
      throw error;
    }
  }

  if (sessionExpired) return <SessionEnded user={boot} section="tasks" />;

  return (
    <Shell user={boot} section="tasks" createReturnTo={returnTo} onCreateTask={() => setCreateOpen(true)}>
      <div className="workspace-inner tasks-view">
        <div className="page-topline">
          <span>{formatDate(boot.today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
        </div>

        <header className="tasks-page-header">
          <div>
            <p className="tasks-kicker">Мой семестр / задачи</p>
            <h1>Задачи<span aria-hidden="true">.</span></h1>
            <p className="tasks-intro">Дела со сроком и без него — в одном списке.</p>
          </div>
          <button type="button" className="tasks-create" onClick={() => setCreateOpen(true)}><Plus size={18} aria-hidden="true" /> Новая задача</button>
        </header>

        <nav className="tasks-filters" aria-label="Фильтр задач">
          {filters.map(({ key, label }) => (
            <a
              key={key}
              href={taskListHref(key)}
              className={key === filter ? "is-current" : undefined}
              aria-current={key === filter ? "page" : undefined}
            >
              <span>{label}</span>
              <span className="tasks-filter-count">{tasks.kind === "ready" ? view.counts[key] : "—"}</span>
            </a>
          ))}
        </nav>

        {tasks.kind === "ready" ? (
          <div className="tasks-content">
            <p className="tasks-result-count" role="status">{view.counts[filter]} {taskWord(view.counts[filter])}</p>
            {view.sections.length ? view.sections.map((section) => (
              <TaskListSection
                key={section.key}
                section={section}
                today={boot.today}
                returnTo={returnTo}
                pendingId={pendingId}
                onToggle={handleToggle}
                onRequestDelete={setDeleteTarget}
              />
            )) : (
              <div className="tasks-empty">
                <span className="tasks-empty-icon"><ClipboardList size={24} strokeWidth={1.7} aria-hidden="true" /></span>
                <h2>{emptyCopy[filter].title}</h2>
                <p>{emptyCopy[filter].detail}</p>
                {filter === "all" ? <button type="button" onClick={() => setCreateOpen(true)}><Plus size={17} aria-hidden="true" /> Добавить задачу</button> : null}
              </div>
            )}
          </div>
        ) : tasks.kind === "error" ? (
          <div className="tasks-empty" role="alert">
            <h2>Не удалось загрузить задачи</h2>
            <p>Проверьте соединение и попробуйте ещё раз.</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)}>Повторить</button>
          </div>
        ) : (
          <div className="tasks-loading" role="status" aria-label="Загружаем задачи"><span /><span /><span /></div>
        )}
      </div>
      <TaskCreateDialog open={createOpen} group={boot.group} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      <TaskDeleteDialog task={deleteTarget} onClose={() => setDeleteTarget(null)} onDelete={handleDelete} />
      <div className={`notice${notice ? " is-visible" : ""}`} role="status" aria-live="polite">{notice}</div>
    </Shell>
  );
}
