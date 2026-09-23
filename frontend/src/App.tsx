import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpenText, CheckCheck, Plus } from "lucide-react";
import { completeTask, getSchedule, getTasks, UnauthorizedError } from "./api";
import { addDays, formatDate, isOverdue, lessonWord, lessonsForDate, taskWord } from "./dates";
import { DayAgenda } from "./DayAgenda";
import { Shell } from "./Shell";
import { TaskPanel } from "./TaskPanel";
import { WeekStrip } from "./WeekStrip";
import type { BootData, Loadable, Schedule, Task } from "./types";

export function App({ boot }: { boot: BootData }) {
  const [selectedDate, setSelectedDate] = useState(boot.today);
  const [tasks, setTasks] = useState<Loadable<Task[]>>({ kind: "loading" });
  const [schedule, setSchedule] = useState<Loadable<Schedule>>({ kind: "loading" });
  const [taskRetry, setTaskRetry] = useState(0);
  const [scheduleRetry, setScheduleRetry] = useState(0);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setTasks({ kind: "loading" });
    getTasks(controller.signal)
      .then((data) => setTasks({ kind: "ready", data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof UnauthorizedError) setSessionExpired(true);
        else setTasks({ kind: "error" });
      });
    return () => controller.abort();
  }, [taskRetry]);

  useEffect(() => {
    if (!boot.group) return;
    const controller = new AbortController();
    setSchedule({ kind: "loading" });
    getSchedule(boot.group, controller.signal)
      .then((data) => setSchedule({ kind: "ready", data }))
      .catch(() => { if (!controller.signal.aborted) setSchedule({ kind: "error" }); });
    return () => controller.abort();
  }, [boot.group, scheduleRetry]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const taskList = tasks.kind === "ready" ? tasks.data : [];
  const activeTasks = taskList.filter((task) => task.status !== "done");
  const overdueCount = activeTasks.filter((task) => isOverdue(task)).length;
  const dayLessons = schedule.kind === "ready" ? lessonsForDate(schedule.data, selectedDate) : [];

  async function handleComplete(id: number) {
    if (pendingId !== null) return;
    setPendingId(id);
    try {
      await completeTask(id, boot.csrfToken);
      setTasks((current) => current.kind === "ready"
        ? { kind: "ready", data: current.data.map((task) => task.id === id ? { ...task, status: "done" } : task) }
        : current);
      setNotice("Задача выполнена");
    } catch (error) {
      if (error instanceof UnauthorizedError) setSessionExpired(true);
      else setNotice("Не получилось отметить задачу. Попробуйте ещё раз.");
    } finally {
      setPendingId(null);
    }
  }

  if (sessionExpired) {
    return (
      <Shell user={boot}>
        <div className="workspace-inner">
          <section className="session-ended" aria-labelledby="session-title">
            <p className="eyebrow">Мой семестр</p>
            <h1 id="session-title">Нужно войти снова</h1>
            <p>Вы давно не открывали эту страницу, и сеанс завершился. После входа обзор снова загрузит расписание и задачи.</p>
            <a className="primary-action" href="/ui/login">Войти</a>
          </section>
        </div>
      </Shell>
    );
  }

  return (
    <Shell user={boot}>
      <div className="workspace-inner">
        <header className="page-topline">
          <span>{formatDate(boot.today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
          <a href="/ui" className="old-version-link">Прежний обзор <ArrowUpRight size={15} aria-hidden="true" /></a>
        </header>

        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="hero-kicker">Мой семестр / обзор</p>
            <h1 id="page-title">Пары и дела<br /><em>на день.</em></h1>
            <p>{boot.firstName ? `${boot.firstName}, ` : ""}выберите день недели и посмотрите, что запланировано.</p>
            <div className="hero-actions">
              <a className="primary-action" href="/ui/tasks/new"><Plus size={18} aria-hidden="true" /> Новая задача</a>
              <a className="quiet-action" href="/ui/calendar">Открыть календарь <ArrowUpRight size={17} aria-hidden="true" /></a>
            </div>
          </div>
          <div className="hero-aside">
            <span className="hero-aside-label">Ваш план</span>
            <div className="hero-stat"><BookOpenText size={19} aria-hidden="true" /><strong>{schedule.kind === "ready" ? dayLessons.length : "—"}</strong><span>{lessonWord(dayLessons.length)} на день</span></div>
            <div className="hero-stat"><CheckCheck size={19} aria-hidden="true" /><strong>{tasks.kind === "ready" ? activeTasks.length : "—"}</strong><span>{taskWord(activeTasks.length)} в работе</span></div>
            {overdueCount > 0 ? <p className="hero-alert">Просрочено: {overdueCount}. <a href="/ui/tasks?filter=overdue">Посмотреть</a></p> : null}
            <a className="hero-group" href="/ui/profile">{boot.group || "Указать учебную группу"}<ArrowUpRight size={15} aria-hidden="true" /></a>
          </div>
        </section>

        <WeekStrip
          selectedDate={selectedDate}
          today={boot.today}
          tasks={taskList}
          schedule={schedule}
          onSelect={setSelectedDate}
          onShift={(days) => setSelectedDate((current) => addDays(current, days))}
        />

        <div className="content-grid">
          <DayAgenda date={selectedDate} group={boot.group} schedule={schedule} onRetry={() => setScheduleRetry((value) => value + 1)} />
          <TaskPanel tasks={tasks} today={boot.today} pendingId={pendingId} onComplete={handleComplete} onRetry={() => setTaskRetry((value) => value + 1)} />
        </div>
      </div>
      <div className={`notice${notice ? " is-visible" : ""}`} role="status" aria-live="polite">{notice}</div>
    </Shell>
  );
}
