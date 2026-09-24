import { isOverdue, moscowDateKey } from "./dates";
import type { Task } from "./types";

export type TaskFilter = "all" | "active" | "today" | "overdue" | "done";
export type TaskCounts = Record<TaskFilter, number>;
export type TaskSectionKey = "overdue" | "today" | "upcoming" | "no_due" | "done";

export type TaskSection = {
  key: TaskSectionKey;
  title: string;
  subtitle: string;
  items: Task[];
};

export type TaskView = {
  filter: TaskFilter;
  counts: TaskCounts;
  sections: TaskSection[];
};

const sectionMeta: ReadonlyArray<Pick<TaskSection, "key" | "title" | "subtitle">> = [
  { key: "overdue", title: "Просрочено", subtitle: "Срок прошёл, задача открыта" },
  { key: "today", title: "Сегодня", subtitle: "Срок сегодня" },
  { key: "upcoming", title: "Ближайшие", subtitle: "После сегодняшнего дня" },
  { key: "no_due", title: "Без срока", subtitle: "Не привязаны к дню" },
  { key: "done", title: "Выполнено", subtitle: "Можно вернуть в работу" },
];

export function normalizeTaskFilter(value: string | null | undefined): TaskFilter {
  switch (value) {
    case "active":
    case "today":
    case "overdue":
    case "done":
      return value;
    default:
      return "all";
  }
}

export function deriveTaskView(
  tasks: readonly Task[],
  rawFilter: string | null | undefined,
  today: string,
  now = new Date(),
): TaskView {
  const filter = normalizeTaskFilter(rawFilter);
  const counts: TaskCounts = { all: tasks.length, active: 0, today: 0, overdue: 0, done: 0 };
  const grouped: Record<TaskSectionKey, Task[]> = {
    overdue: [], today: [], upcoming: [], no_due: [], done: [],
  };

  for (const task of tasks) {
    const done = task.status === "done";
    const dueDate = task.due_at === null ? null : moscowDateKey(task.due_at);
    const overdue = isOverdue(task, now);

    if (done) counts.done += 1;
    else {
      counts.active += 1;
      if (dueDate === today) counts.today += 1;
      if (overdue) counts.overdue += 1;
    }

    if (
      (filter === "active" && done)
      || (filter === "today" && (done || dueDate !== today))
      || (filter === "overdue" && !overdue)
      || (filter === "done" && !done)
    ) continue;

    const key: TaskSectionKey = done
      ? "done"
      : dueDate === null
        ? "no_due"
        : dueDate < today
          ? "overdue"
          : dueDate === today
            ? "today"
            : "upcoming";
    grouped[key].push(task);
  }

  for (const key of ["overdue", "today", "upcoming"] as const) {
    grouped[key].sort((left, right) => Date.parse(left.due_at!) - Date.parse(right.due_at!));
  }
  grouped.no_due.sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
  grouped.done.sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));

  return {
    filter,
    counts,
    sections: sectionMeta
      .filter(({ key }) => grouped[key].length > 0)
      .map(({ key, title, subtitle }) => ({ key, title, subtitle, items: grouped[key] })),
  };
}
