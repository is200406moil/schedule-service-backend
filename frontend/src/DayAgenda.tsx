import { ArrowUpRight, CalendarDays, MapPin, RefreshCw } from "lucide-react";
import { formatDate, lessonWord, lessonsForDate } from "./dates";
import type { Loadable, Schedule } from "./types";

type Props = {
  date: string;
  group: string;
  schedule: Loadable<Schedule>;
  onRetry: () => void;
};

export function DayAgenda({ date, group, schedule, onRetry }: Props) {
  const lessons = schedule.kind === "ready" ? lessonsForDate(schedule.data, date) : [];
  return (
    <section className="agenda-panel" aria-labelledby="agenda-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Расписание</p>
          <h2 id="agenda-heading">{formatDate(date, { weekday: "long", day: "numeric", month: "long" })}</h2>
        </div>
        <a className="panel-link" href={`/ui/calendar/preview?date=${date}`} aria-label="Открыть этот день в календаре">
          В календарь <ArrowUpRight size={18} aria-hidden="true" />
        </a>
      </div>

      {!group ? (
        <div className="agenda-empty">
          <CalendarDays size={25} aria-hidden="true" />
          <h3>Какая у вас группа?</h3>
          <p>Укажите её в профиле, и здесь появятся пары.</p>
          <a href="/ui/profile">Указать группу</a>
        </div>
      ) : schedule.kind === "loading" ? (
        <div className="agenda-loading" role="status" aria-label="Загружаем расписание">
          <span /><span /><span />
        </div>
      ) : schedule.kind === "error" ? (
        <div className="agenda-empty">
          <CalendarDays size={25} aria-hidden="true" />
          <h3>Расписание не загрузилось</h3>
          <p>Задачи доступны. Расписание можно попробовать загрузить ещё раз.</p>
          <button type="button" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" /> Повторить</button>
        </div>
      ) : lessons.length === 0 ? (
        <div className="agenda-empty">
          <CalendarDays size={25} aria-hidden="true" />
          <h3>Пар на этот день нет</h3>
          <p>Можно заняться задачами или посмотреть другие дни.</p>
          <a href="/ui/tasks/preview">Открыть задачи</a>
        </div>
      ) : (
        <>
          <p className="agenda-count">{lessons.length} {lessonWord(lessons.length)} в расписании</p>
          <ol className="lesson-list">
            {lessons.map((lesson, index) => (
              <li className="lesson-row" key={`${lesson.time_start}-${lesson.name}-${index}`}>
                <div className="lesson-time"><strong>{lesson.time_start.slice(0, 5)}</strong><span>{lesson.time_end.slice(0, 5)}</span></div>
                <div className="lesson-body">
                  <strong>{lesson.name}</strong>
                  <p>{[lesson.types, lesson.teachers.join(", ")].filter(Boolean).join(" · ") || "Занятие"}</p>
                  {lesson.rooms.length > 0 ? <span className="lesson-room"><MapPin size={13} aria-hidden="true" /> {lesson.rooms.join(", ")}</span> : null}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
