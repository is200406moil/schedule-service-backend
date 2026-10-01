import { ArrowUpRight, ChevronRight, Plus } from "lucide-react";
import { formatDue } from "./dates";
import { deriveTaskView } from "./taskView";
import type { Loadable, Task } from "./types";

export function ProfileTasks({ tasks, today, onRetry, onCreate }: { tasks: Loadable<Task[]>; today: string; onRetry: () => void; onCreate: () => void }) {
  const view = deriveTaskView(tasks.kind === "ready" ? tasks.data : [], "active", today);
  const upcoming = view.sections.flatMap((section) => section.items).slice(0, 3);
  return (
    <section className="profile-tasks" aria-labelledby="profile-tasks-heading">
      <header><div><h2 id="profile-tasks-heading">Мои задачи</h2><p>Ближайшие дела со сроком и без него.</p></div><a href="/ui/tasks/preview">Все задачи <ArrowUpRight size={17} aria-hidden="true" /></a></header>
      {tasks.kind === "loading" ? <p className="profile-tasks-message" role="status">Загружаем задачи…</p> : tasks.kind === "error" ? <div className="profile-tasks-message" role="alert"><p>Не удалось загрузить задачи.</p><button type="button" className="profile-secondary-button" onClick={onRetry}>Повторить</button></div> : <>
        <div className="profile-task-counts"><a href="/ui/tasks/preview?filter=active"><strong>{view.counts.active}</strong> в работе</a><a href="/ui/tasks/preview?filter=done"><strong>{view.counts.done}</strong> выполнено</a></div>
        {upcoming.length ? <ul className="profile-task-list">{upcoming.map((task) => <li key={task.id}><a href={`/ui/tasks/${task.id}/edit/preview?return_to=/ui/profile/preview`}><span className="profile-task-mark" aria-hidden="true" /><span className="profile-task-name"><strong>{task.title}</strong>{task.subject ? <small>{task.subject}</small> : null}</span><span className="profile-task-date">{formatDue(task.due_at, today)}</span><ChevronRight size={17} aria-hidden="true" /></a></li>)}</ul> : <p className="profile-tasks-message">Активных задач нет. Можно добавить новую.</p>}
        <button type="button" className="profile-task-add" onClick={onCreate}><Plus size={17} aria-hidden="true" /> Добавить задачу</button>
      </>}
    </section>
  );
}
