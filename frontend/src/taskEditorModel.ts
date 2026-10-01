import type { NewTask, Schedule, Task, TaskEditPayload } from "./types";

export type TaskEditorFields = {
  title: string;
  body: string;
  dueAt: string;
  subject: string;
  status: Task["status"];
};

const moscowDateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function blankTaskFields(initialSubject = "", initialDueAt = ""): TaskEditorFields {
  return { title: "", body: "", dueAt: initialDueAt, subject: initialSubject.slice(0, 255), status: "todo" };
}

export function moscowLocalDateTime(value: string | null): string {
  if (value === null) return "";
  const parts = moscowDateTime.formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function fieldsFromTask(task: Task): TaskEditorFields {
  return {
    title: task.title,
    body: task.body ?? "",
    dueAt: moscowLocalDateTime(task.due_at),
    subject: task.subject ?? "",
    status: task.status,
  };
}

export function taskPayload(fields: TaskEditorFields): TaskEditPayload {
  return {
    title: fields.title.trim(),
    body: fields.body.trim() || null,
    due_at: fields.dueAt || null,
    subject: fields.subject.trim() || null,
    status: fields.status,
  };
}

export function taskPatchPayload(fields: TaskEditorFields, baseline: TaskEditorFields): Partial<TaskEditPayload> {
  const payload: Partial<TaskEditPayload> = taskPayload(fields);
  if (fields.dueAt === baseline.dueAt) delete payload.due_at;
  return payload;
}

export function newTaskPayload(fields: TaskEditorFields): NewTask {
  const { status: _status, ...payload } = taskPayload(fields);
  return payload;
}

export function subjectNames(schedule: Schedule): string[] {
  const names = new Set<string>();
  for (const day of Object.values(schedule.schedule)) {
    for (const slot of day.lessons) {
      for (const lesson of slot) {
        if (lesson.name.trim()) names.add(lesson.name.trim());
      }
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right, "ru"));
}

function comparable(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}]+/gu, "");
}

export function matchingSubjects(names: readonly string[], query: string, limit = 7): string[] {
  const normalized = comparable(query);
  return names.filter((name) => comparable(name).includes(normalized)).slice(0, limit);
}
