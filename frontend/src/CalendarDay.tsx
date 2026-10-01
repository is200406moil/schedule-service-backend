import { BookOpenText, Check, Clock3, MapPin, Plus, RefreshCw } from "lucide-react";
import { academicWeekNumber, formatDate, isOverdue, lessonWord, lessonsForDate, taskDueOn, taskWord } from "./dates";
import { moscowTime } from "./calendarDates";
import type { Lesson, Loadable, Schedule, Task } from "./types";

type Props = {
  date: string;
  group: string;
  schedule: Loadable<Schedule>;
  tasks: Loadable<Task[]>;
  pendingId: number | null;
  highlightLesson: string;
  onRetrySchedule: () => void;
  onRetryTasks: () => void;
  onToggleTask: (id: number) => void;
  onAddTask: () => void;
  onAddForLesson: (lesson: Lesson) => void;
};

export function CalendarDay({ date, group, schedule, tasks, pendingId, highlightLesson, onRetrySchedule, onRetryTasks, onToggleTask, onAddTask, onAddForLesson }: Props) {
  const week = academicWeekNumber(date);
  const lessons = schedule.kind === "ready" ? lessonsForDate(schedule.data, date) : [];
  const dayTasks = tasks.kind === "ready"
    ? tasks.data.filter((task) => taskDueOn(task, date)).sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.due_at ?? "").localeCompare(b.due_at ?? ""))
    : [];
  const returnTo = encodeURIComponent(`/ui/calendar/preview?date=${date}`);

  return (
    <aside className="calendar-day" aria-labelledby="calendar-day-title">
      <div className="calendar-day-head">
        <p>Выбранный день</p>
        <h2 id="calendar-day-title">{formatDate(date, { weekday: "long", day: "numeric", month: "long" })}</h2>
        <span>{week}-я неделя, {week % 2 === 0 ? "чётная" : "нечётная"}</span>
      </div>

      <section className="calendar-day-section" aria-labelledby="calendar-lessons-title">
        <div className="calendar-section-heading">
          <h3 id="calendar-lessons-title">Пары</h3>
          <span>{schedule.kind === "ready" ? `${lessons.length} ${lessonWord(lessons.length)}` : ""}</span>
        </div>
        {!group ? (
          <div className="calendar-inline-empty"><BookOpenText size={22} aria-hidden="true" /><p>Укажите группу в профиле, чтобы увидеть расписание.</p><a href="/ui/profile/preview">Указать группу</a></div>
        ) : schedule.kind === "loading" ? (
          <div className="calendar-skeleton" role="status" aria-label="Загружаем расписание"><span /><span /></div>
        ) : schedule.kind === "error" ? (
          <div className="calendar-inline-empty"><BookOpenText size={22} aria-hidden="true" /><p>Не удалось загрузить расписание. Задачи остаются доступны.</p><button type="button" onClick={onRetrySchedule}><RefreshCw size={15} aria-hidden="true" /> Повторить</button></div>
        ) : lessons.length === 0 ? (
          <div className="calendar-inline-empty"><BookOpenText size={22} aria-hidden="true" /><p>Пар на этот день нет.</p></div>
        ) : (
          <ol className="calendar-lesson-list">
            {lessons.map((lesson, index) => {
              const start = lesson.time_start.slice(0, 5);
              return (
                <li className={`calendar-lesson${highlightLesson === start ? " is-highlighted" : ""}`} key={`${start}-${lesson.name}-${index}`}>
                  <div className="calendar-lesson-time"><strong>{start}</strong><span>{lesson.time_end.slice(0, 5)}</span></div>
                  <div className="calendar-lesson-info">
                    <strong>{lesson.name}</strong>
                    <span>{[lesson.types, lesson.teachers.join(", ")].filter(Boolean).join(" · ") || "Занятие"}</span>
                    {lesson.rooms.length ? <small><MapPin size={13} aria-hidden="true" />{lesson.rooms.join(", ")}</small> : null}
                    <button type="button" onClick={() => onAddForLesson(lesson)}><Plus size={14} aria-hidden="true" /> Задача к паре</button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="calendar-day-section" aria-labelledby="calendar-tasks-title">
        <div className="calendar-section-heading">
          <h3 id="calendar-tasks-title">Задачи</h3>
          <button type="button" onClick={onAddTask} aria-label="Добавить задачу на выбранный день"><Plus size={18} aria-hidden="true" /></button>
        </div>
        {tasks.kind === "loading" ? (
          <div className="calendar-skeleton" role="status" aria-label="Загружаем задачи"><span /><span /></div>
        ) : tasks.kind === "error" ? (
          <div className="calendar-inline-empty"><p>Не удалось загрузить задачи.</p><button type="button" onClick={onRetryTasks}><RefreshCw size={15} aria-hidden="true" /> Повторить</button></div>
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
                <a href={`/ui/tasks/${task.id}/edit/preview?return_to=${returnTo}`}>
                  <strong>{task.title}</strong>
                  <span>{moscowTime(task.due_at ?? "")}{task.subject ? ` · ${task.subject}` : ""}{isOverdue(task) ? " · срок прошёл" : ""}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
