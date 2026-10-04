import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, GraduationCap, Plus } from "lucide-react";
import { createTask, getSchedule, getTasks, setTaskStatus, UnauthorizedError } from "../../shared/api";
import { CalendarDay } from "./CalendarDay";
import { monthDates, monthLabel, parseCalendarDate, shiftMonth } from "./calendarDates";
import { formatDate, lessonWord, lessonsForDate, moscowDateKey, taskDueOn, taskWord } from "../../shared/dates";
import { MonthGrid } from "./MonthGrid";
import { TaskCreateDialog } from "../tasks/TaskCreateDialog";
import { SessionEnded } from "../../shared/SessionEnded";
import { Shell } from "../../shared/Shell";
import { calendarHref, uiRoutes } from "../../shared/uiRoutes";
import { subjectNames } from "../tasks/taskEditorModel";
import type { CalendarBootData, Lesson, Loadable, NewTask, Schedule, Task } from "../../shared/types";

export function CalendarApp({ boot }: { boot: CalendarBootData }) {
  const initialDate = parseCalendarDate(boot.initialDate, boot.today);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [viewMonth, setViewMonth] = useState(`${initialDate.slice(0, 7)}-01`);
  const [highlightLesson, setHighlightLesson] = useState(/^([01]\d|2[0-3]):[0-5]\d$/.test(boot.initialLesson ?? "") ? boot.initialLesson ?? "" : "");
  const [schedule, setSchedule] = useState<Loadable<Schedule>>(boot.group ? { kind: "loading" } : { kind: "ready", data: { group: "", schedule: {} } });
  const [tasks, setTasks] = useState<Loadable<Task[]>>({ kind: "loading" });
  const [scheduleRetry, setScheduleRetry] = useState(0);
  const [taskRetry, setTaskRetry] = useState(0);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [taskPreset, setTaskPreset] = useState<{ subject: string; time: string } | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (boot.initialDate && boot.initialDate !== initialDate) {
      window.history.replaceState({}, "", calendarHref(initialDate));
    }
  }, [boot.initialDate, initialDate]);

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

  const taskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (tasks.kind !== "ready") return counts;
    for (const task of tasks.data) {
      if (task.status === "done" || !task.due_at) continue;
      const key = moscowDateKey(task.due_at);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  const selectedDayAnnouncement = useMemo(() => {
    const dateText = formatDate(selectedDate, { weekday: "long", day: "numeric", month: "long" });
    const lessonCount = schedule.kind === "ready" ? lessonsForDate(schedule.data, selectedDate).length : null;
    const lessonsText = schedule.kind === "ready"
      ? `${lessonCount} ${lessonWord(lessonCount ?? 0)}`
      : schedule.kind === "loading" ? "расписание загружается" : "расписание недоступно";
    const taskCount = tasks.kind === "ready" ? tasks.data.filter((task) => taskDueOn(task, selectedDate)).length : null;
    const tasksText = taskCount === null
      ? tasks.kind === "loading" ? "задачи загружаются" : "задачи недоступны"
      : `${taskCount} ${taskWord(taskCount)}`;
    return `${dateText}. ${lessonsText}, ${tasksText}.`;
  }, [selectedDate, schedule, tasks]);

  function selectDate(key: string) {
    setSelectedDate(key);
    setViewMonth(`${key.slice(0, 7)}-01`);
    setHighlightLesson("");
    window.history.replaceState({}, "", calendarHref(key));
  }

  function moveMonth(delta: number) {
    const nextMonth = shiftMonth(viewMonth, delta);
    const dayCount = monthDates(nextMonth).filter((key) => key.slice(0, 7) === nextMonth.slice(0, 7)).length;
    const day = Math.min(Number(selectedDate.slice(-2)), dayCount);
    selectDate(`${nextMonth.slice(0, 8)}${String(day).padStart(2, "0")}`);
  }

  async function handleToggleTask(id: number) {
    if (pendingId !== null || tasks.kind !== "ready") return;
    const task = tasks.data.find((item) => item.id === id);
    if (!task) return;
    const status = task.status === "done" ? "todo" : "done";
    setPendingId(id);
    try {
      await setTaskStatus(id, status, boot.csrfToken);
      setTasks((current) => current.kind === "ready"
        ? { kind: "ready", data: current.data.map((item) => item.id === id ? { ...item, status } : item) }
        : current);
      setNotice(status === "done" ? "Задача выполнена" : "Задача снова активна");
    } catch (error) {
      if (error instanceof UnauthorizedError) setSessionExpired(true);
      else setNotice("Не удалось изменить задачу. Попробуйте ещё раз.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleCreate(data: NewTask) {
    try {
      const created = await createTask(data, boot.csrfToken);
      setTasks((current) => current.kind === "ready"
        ? { kind: "ready", data: [...current.data, created] }
        : current);
      if (tasks.kind !== "ready") setTaskRetry((value) => value + 1);
      if (created.due_at) {
        const dueDate = moscowDateKey(created.due_at);
        if (dueDate !== selectedDate) selectDate(dueDate);
        setNotice("Задача добавлена");
      } else {
        setNotice("Задача без срока добавлена в раздел «Задачи».");
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) setSessionExpired(true);
      throw error;
    }
  }

  function addForLesson(lesson: Lesson) {
    setTaskPreset({ subject: lesson.name, time: lesson.time_start.slice(0, 5) });
    setDialogOpen(true);
  }

  function openCreate() {
    setTaskPreset(null);
    setDialogOpen(true);
  }

  if (sessionExpired) return <SessionEnded user={boot} section="calendar" />;

  return (
    <Shell user={boot} section="calendar" onCreateTask={openCreate}>
      <div className="workspace-inner calendar-view">
        <div className="page-topline">
          <span>{formatDate(boot.today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
        </div>
        <header className="calendar-page-header">
          <div>
            <h1>Календарь</h1>
            <p>Пары и сроки задач — по дням.</p>
          </div>
          <button type="button" className="calendar-create" onClick={openCreate}><Plus size={18} aria-hidden="true" /> Новая задача</button>
        </header>

        <div className="calendar-layout">
          <p className="calendar-sr-only" role="status" aria-live="polite" aria-atomic="true">{selectedDayAnnouncement}</p>
          <section className="calendar-month-panel" aria-labelledby="calendar-month-title">
            <div className="calendar-month-toolbar">
              <div className="calendar-month-title">
                <h2 id="calendar-month-title">{monthLabel(viewMonth)}</h2>
                <a href={uiRoutes.profile}><GraduationCap size={16} aria-hidden="true" />{boot.group || "Указать группу"}</a>
              </div>
              <div className="calendar-month-actions">
                <button type="button" onClick={() => moveMonth(-1)} disabled={shiftMonth(viewMonth, -1) === viewMonth} aria-label="Предыдущий месяц"><ChevronLeft size={19} aria-hidden="true" /></button>
                <button type="button" className="calendar-today-button" onClick={() => selectDate(boot.today)} disabled={selectedDate === boot.today}>Сегодня</button>
                <button type="button" onClick={() => moveMonth(1)} disabled={shiftMonth(viewMonth, 1) === viewMonth} aria-label="Следующий месяц"><ChevronRight size={19} aria-hidden="true" /></button>
              </div>
            </div>
            <MonthGrid month={viewMonth} selectedDate={selectedDate} today={boot.today} schedule={schedule} taskCounts={taskCounts} onSelect={selectDate} />
            <div className="calendar-legend"><span><i className="legend-book" /> Пары</span><span><i className="legend-task" /> Задачи</span></div>
          </section>
          <CalendarDay
            date={selectedDate}
            group={boot.group}
            schedule={schedule}
            tasks={tasks}
            pendingId={pendingId}
            highlightLesson={highlightLesson}
            onRetrySchedule={() => setScheduleRetry((value) => value + 1)}
            onRetryTasks={() => setTaskRetry((value) => value + 1)}
            onToggleTask={handleToggleTask}
            onAddTask={openCreate}
            onAddForLesson={addForLesson}
          />
        </div>
      </div>
      <TaskCreateDialog
        open={dialogOpen}
        group={boot.group}
        initialDueAt={`${selectedDate}T${taskPreset?.time || "18:00"}`}
        initialSubject={taskPreset?.subject}
        subjects={schedule.kind === "ready" ? subjectNames(schedule.data) : undefined}
        onClose={() => setDialogOpen(false)}
        onCreate={handleCreate}
      />
      <div className={`notice${notice ? " is-visible" : ""}`} role="status" aria-live="polite">{notice}</div>
    </Shell>
  );
}
