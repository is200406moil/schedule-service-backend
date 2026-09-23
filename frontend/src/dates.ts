import type { Lesson, Schedule, Task } from "./types";

const DAY_MS = 86_400_000;
const MOSCOW_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function utcDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKey(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function addDays(key: string, count: number): string {
  return dateKey(new Date(utcDate(key).getTime() + count * DAY_MS));
}

export function weekDates(key: string): string[] {
  const weekday = utcDate(key).getUTCDay();
  const monday = addDays(key, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function academicWeekNumber(key: string): number {
  const day = utcDate(key);
  const year = day.getUTCFullYear();
  const month = day.getUTCMonth();
  const start = month >= 8
    ? `${year}-09-01`
    : month === 0 || (month === 1 && day.getUTCDate() < 9)
      ? `${year - 1}-09-01`
      : `${year}-02-09`;
  const firstMonday = weekDates(start)[0];
  return Math.max(1, Math.floor((day.getTime() - utcDate(firstMonday).getTime()) / (7 * DAY_MS)) + 1);
}

export function lessonsForDate(schedule: Schedule, key: string): Lesson[] {
  const weekday = utcDate(key).getUTCDay() || 7;
  const parity = academicWeekNumber(key) % 2 === 0 ? 2 : 1;
  const slots = schedule.schedule[String(weekday)]?.lessons ?? [];
  return slots
    .flatMap((slot) => slot.filter((lesson) => lesson.weeks.includes(parity)))
    .sort((left, right) => left.time_start.localeCompare(right.time_start));
}

export function moscowDateKey(value: string): string {
  const parts = MOSCOW_DATE.formatToParts(new Date(value));
  const pick = (part: string) => parts.find((item) => item.type === part)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function taskDueOn(task: Task, key: string): boolean {
  return task.due_at !== null && moscowDateKey(task.due_at) === key;
}

export function isOverdue(task: Task, now = new Date()): boolean {
  return task.status !== "done" && task.due_at !== null && new Date(task.due_at) < now;
}

export function formatDate(key: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", ...options }).format(utcDate(key));
}

export function formatDue(value: string | null, today: string): string {
  if (value === null) return "Без срока";
  const key = moscowDateKey(value);
  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
  if (key === today) return `Сегодня, ${time}`;
  if (key === addDays(today, 1)) return `Завтра, ${time}`;
  return `${formatDate(key, { day: "numeric", month: "short" })}, ${time}`;
}

export function lessonWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "пара";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "пары";
    return "пар";
}

export function taskWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "задача";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "задачи";
  return "задач";
}
