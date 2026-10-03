import { academicWeekNumber, formatDate } from "../../shared/dates";
import { CalendarDayLessons } from "./CalendarDayLessons";
import { CalendarDayTasks } from "./CalendarDayTasks";
import type { Lesson, Loadable, Schedule, Task } from "../../shared/types";

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

  return (
    <aside className="calendar-day" aria-labelledby="calendar-day-title">
      <div className="calendar-day-head">
        <p>Выбранный день</p>
        <h2 id="calendar-day-title">{formatDate(date, { weekday: "long", day: "numeric", month: "long" })}</h2>
        <span>{week}-я неделя, {week % 2 === 0 ? "чётная" : "нечётная"}</span>
      </div>

      <CalendarDayLessons
        date={date}
        group={group}
        schedule={schedule}
        highlightLesson={highlightLesson}
        onRetry={onRetrySchedule}
        onAddForLesson={onAddForLesson}
      />
      <CalendarDayTasks
        date={date}
        tasks={tasks}
        pendingId={pendingId}
        onRetry={onRetryTasks}
        onToggleTask={onToggleTask}
        onAddTask={onAddTask}
      />
    </aside>
  );
}
