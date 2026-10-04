// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalendarDayTasks } from "../features/calendar/CalendarDayTasks";
import { DayAgenda } from "../features/overview/DayAgenda";
import { TaskPanel } from "../features/overview/TaskPanel";
import { ProfileTasks } from "../features/profile/ProfileTasks";
import { TaskListSection } from "../features/tasks/TaskListSection";
import type { Task } from "./types";

const task: Task = {
  id: 12, title: "Лабораторная", body: null, subject: "Базы данных", status: "todo",
  due_at: "2026-10-03T10:00:00Z", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z",
};
const noop = () => {};

function documentFor(html: string) {
  return new DOMParser().parseFromString(html, "text/html");
}

function linkUrl(document: Document, selector: string) {
  return new URL(document.querySelector<HTMLAnchorElement>(selector)!.getAttribute("href")!, "https://semester.test");
}

describe("links between workspace pages", () => {
  it("opens the selected overview day in the canonical calendar", () => {
    const document = documentFor(renderToStaticMarkup(<DayAgenda date="2026-10-03" group="" schedule={{ kind: "loading" }} onRetry={noop} />));
    const calendar = linkUrl(document, ".panel-link");
    expect(calendar.pathname).toBe("/ui/calendar");
    expect(calendar.searchParams.get("date")).toBe("2026-10-03");
    expect(document.querySelector(".agenda-empty a")!.getAttribute("href")).toBe("/ui/profile");
  });

  it("returns from overview and profile task editing to the originating page", () => {
    const overview = documentFor(renderToStaticMarkup(<TaskPanel tasks={{ kind: "ready", data: [task] }} today="2026-10-03" pendingId={null} onComplete={noop} onRetry={noop} onCreate={noop} />));
    const profile = documentFor(renderToStaticMarkup(<ProfileTasks tasks={{ kind: "ready", data: [task] }} today="2026-10-03" onRetry={noop} onCreate={noop} />));
    const overviewEdit = linkUrl(overview, ".task-content");
    const profileEdit = linkUrl(profile, ".profile-task-list a");
    expect(overviewEdit.pathname).toBe("/ui/tasks/12/edit");
    expect(overviewEdit.searchParams.get("return_to")).toBe("/ui");
    expect(profileEdit.pathname).toBe("/ui/tasks/12/edit");
    expect(profileEdit.searchParams.get("return_to")).toBe("/ui/profile");
    expect(linkUrl(profile, ".profile-task-counts a").searchParams.get("filter")).toBe("active");
  });

  it("keeps the selected calendar day and task filter in edit return links", () => {
    const calendar = documentFor(renderToStaticMarkup(<CalendarDayTasks date="2026-10-03" tasks={{ kind: "ready", data: [task] }} pendingId={null} onRetry={noop} onToggleTask={noop} onAddTask={noop} />));
    const tasks = documentFor(renderToStaticMarkup(<TaskListSection section={{ key: "upcoming", title: "Ближайшие", subtitle: "После сегодняшнего дня", items: [task] }} today="2026-10-02" returnTo="/ui/tasks?filter=active" pendingId={null} onToggle={noop} onRequestDelete={noop} />));
    const calendarEdit = linkUrl(calendar, ".calendar-task a");
    const tasksEdit = linkUrl(tasks, ".tasks-ledger-title");
    expect(calendarEdit.pathname).toBe("/ui/tasks/12/edit");
    expect(calendarEdit.searchParams.get("return_to")).toBe("/ui/calendar?date=2026-10-03");
    expect(tasksEdit.pathname).toBe("/ui/tasks/12/edit");
    expect(tasksEdit.searchParams.get("return_to")).toBe("/ui/tasks?filter=active");
  });
});
