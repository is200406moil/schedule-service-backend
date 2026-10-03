import { ChevronLeft, ChevronRight } from "lucide-react";
import { academicWeekNumber, formatDate, lessonWord, lessonsForDate, taskDueOn, taskWord, weekDates } from "../../shared/dates";
import type { Loadable, Schedule, Task } from "../../shared/types";

type Props = {
  selectedDate: string;
  today: string;
  schedule: Loadable<Schedule>;
  tasks: Task[];
  onSelect: (date: string) => void;
  onShift: (days: number) => void;
};

export function WeekStrip({ selectedDate, today, schedule, tasks, onSelect, onShift }: Props) {
  const dates = weekDates(selectedDate);
  const number = academicWeekNumber(selectedDate);
  return (
    <section className="week-section" aria-labelledby="week-heading">
      <div className="week-heading">
        <div>
          <p className="eyebrow">Ближайшие дни</p>
          <h2 id="week-heading">Неделя {number} <span>· {number % 2 === 0 ? "чётная" : "нечётная"}</span></h2>
        </div>
        <div className="week-controls">
          <button type="button" onClick={() => onShift(-7)} aria-label="Предыдущая неделя"><ChevronLeft size={19} aria-hidden="true" /></button>
          <button type="button" onClick={() => onSelect(today)} disabled={selectedDate === today}>Сегодня</button>
          <button type="button" onClick={() => onShift(7)} aria-label="Следующая неделя"><ChevronRight size={19} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="week-days" role="group" aria-label="Выберите день недели">
        {dates.map((key) => {
          const count = schedule.kind === "ready" ? lessonsForDate(schedule.data, key).length : 0;
          const taskCount = tasks.filter((task) => task.status !== "done" && taskDueOn(task, key)).length;
          const isSelected = key === selectedDate;
          const lessonLabel = schedule.kind === "ready" ? `${count} ${lessonWord(count)}` : "расписание не загружено";
          return (
            <button
              type="button"
              key={key}
              className={`day-tile${isSelected ? " is-selected" : ""}${key === today ? " is-today" : ""}`}
              aria-pressed={isSelected}
              aria-label={`${formatDate(key, { weekday: "long", day: "numeric", month: "long" })}, ${lessonLabel}, ${taskCount} ${taskWord(taskCount)}`}
              onClick={() => onSelect(key)}
            >
              <span className="day-name">{formatDate(key, { weekday: "short" })}</span>
              <strong>{formatDate(key, { day: "numeric" })}</strong>
              <span className="day-meta">
                {schedule.kind === "ready" ? `${count} ${lessonWord(count)}` : ""}
                {taskCount > 0 ? <span className="task-indicator" aria-hidden="true" title={`${taskCount} задач`} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
