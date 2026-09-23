import { BookOpenText, ClipboardList } from "lucide-react";
import { formatDate, lessonWord, lessonsForDate, taskWord } from "./dates";
import { isSelectableCalendarDate, monthDates } from "./calendarDates";
import type { Loadable, Schedule } from "./types";

type Props = {
  month: string;
  selectedDate: string;
  today: string;
  schedule: Loadable<Schedule>;
  taskCounts: Map<string, number>;
  onSelect: (date: string) => void;
};

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function MonthGrid({ month, selectedDate, today, schedule, taskCounts, onSelect }: Props) {
  return (
    <div className="month-calendar" role="group" aria-label={`Дни месяца: ${formatDate(month, { month: "long", year: "numeric" })}`}>
      <div className="month-weekdays" aria-hidden="true">
        {weekdays.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="month-cells">
        {monthDates(month).map((key) => {
          const lessons = schedule.kind === "ready" ? lessonsForDate(schedule.data, key).length : 0;
          const tasks = taskCounts.get(key) ?? 0;
          const selected = key === selectedDate;
          const isToday = key === today;
          const outside = key.slice(0, 7) !== month.slice(0, 7);
          const selectable = isSelectableCalendarDate(key);
          const label = `${formatDate(key, { day: "numeric", month: "long", weekday: "long" })}${isToday ? ", сегодня" : ""}; ${schedule.kind === "ready" ? `${lessons} ${lessonWord(lessons)}` : "расписание не загружено"}; ${tasks} ${taskWord(tasks)}`;
          return (
            <button
              className={`month-cell${selected ? " is-selected" : ""}${isToday ? " is-today" : ""}${outside ? " is-outside" : ""}`}
              key={key}
              type="button"
              disabled={!selectable}
              aria-pressed={selected}
              aria-label={label}
              onClick={() => onSelect(key)}
            >
              <span className="month-cell-number">{Number(key.slice(-2))}</span>
              <span className="month-cell-facts" aria-hidden="true">
                {lessons > 0 ? <span className="month-cell-fact is-lesson"><BookOpenText size={12} />{lessons}</span> : null}
                {tasks > 0 ? <span className="month-cell-fact is-task"><ClipboardList size={12} />{tasks}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
