import { BookOpenText, MapPin, Plus, RefreshCw } from "lucide-react";
import { lessonWord, lessonsForDate } from "../../shared/dates";
import { keyedLessons } from "../../shared/lessonIdentity";
import type { Lesson, Loadable, Schedule } from "../../shared/types";

type Props = {
  date: string;
  group: string;
  schedule: Loadable<Schedule>;
  highlightLesson: string;
  onRetry: () => void;
  onAddForLesson: (lesson: Lesson) => void;
};

export function CalendarDayLessons({ date, group, schedule, highlightLesson, onRetry, onAddForLesson }: Props) {
  const lessons = schedule.kind === "ready" ? lessonsForDate(schedule.data, date) : [];
  return (
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
        <div className="calendar-inline-empty"><BookOpenText size={22} aria-hidden="true" /><p>Не удалось загрузить расписание. Задачи остаются доступны.</p><button type="button" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" /> Повторить</button></div>
      ) : lessons.length === 0 ? (
        <div className="calendar-inline-empty"><BookOpenText size={22} aria-hidden="true" /><p>Пар на этот день нет.</p></div>
      ) : (
        <ol className="calendar-lesson-list">
          {keyedLessons(lessons).map(({ lesson, key }) => {
            const start = lesson.time_start.slice(0, 5);
            return (
              <li className={`calendar-lesson${highlightLesson === start ? " is-highlighted" : ""}`} key={key}>
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
  );
}
