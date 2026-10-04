// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarApp } from "../features/calendar/CalendarApp";
import { ProfileApp } from "../features/profile/ProfileApp";
import { TasksApp } from "../features/tasks/TasksApp";
import { installDialogTestDouble } from "../test/dialogTestUtils";
import { createTask, getSchedule, getTasks } from "./api";
import type { BootData, Schedule, Task, UserProfile } from "./types";

vi.mock("./api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./api")>(),
  createTask: vi.fn(),
  getSchedule: vi.fn(),
  getTasks: vi.fn(),
}));

const boot: BootData = {
  firstName: "Анна", group: "ИКБО-14-23", avatar: "", today: "2026-10-02", csrfToken: "navigation-csrf",
};
const task: Task = {
  id: 12, title: "Лабораторная", body: null, subject: "Базы данных", status: "todo",
  due_at: "2026-10-03T10:00:00Z", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z",
};
const schedule: Schedule = {
  group: boot.group,
  schedule: {
    "6": { lessons: [[
      { name: "Базы данных", weeks: [1, 2], time_start: "09:00", time_end: "10:30", types: "лк", teachers: [], rooms: [] },
      { name: "Алгоритмы", weeks: [1, 2], time_start: "10:45", time_end: "12:15", types: "пр", teachers: [], rooms: [] },
    ]] },
  },
};
const profile: UserProfile = {
  id: 1, email: "student@example.com", is_active: true, first_name: boot.firstName,
  last_name: null, patronymic: null, birth_date: null, group_name: boot.group, avatar_base64: null,
};
let host: HTMLDivElement;
let root: Root;
let dialogs: ReturnType<typeof installDialogTestDouble>;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  vi.resetAllMocks();
  vi.mocked(getTasks).mockResolvedValue([task]);
  vi.mocked(getSchedule).mockResolvedValue(schedule);
  dialogs = installDialogTestDouble();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  dialogs.restore();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

function linkUrl(selector: string) {
  return new URL(host.querySelector<HTMLAnchorElement>(selector)!.getAttribute("href")!, window.location.origin);
}

describe("canonical workspace URL state", () => {
  it("keeps a calendar lesson deep link on load and updates the URL when selecting another day", async () => {
    window.history.replaceState(null, "", "/ui/calendar?date=2026-10-03&lesson=09%3A00");
    await act(async () => root.render(<CalendarApp boot={{ ...boot, initialDate: "2026-10-03", initialLesson: "09:00" }} />));
    expect(host.querySelector(".calendar-lesson.is-highlighted")!.textContent).toContain("Базы данных");
    expect(host.querySelector(".calendar-break")!.textContent).toContain("15 мин");
    expect(host.querySelector('.month-cell[aria-pressed="true"]')!.textContent).toContain("3");
    expect(window.location.search).toBe("?date=2026-10-03&lesson=09%3A00");
    expect(linkUrl(".calendar-task a").searchParams.get("return_to")).toBe("/ui/calendar?date=2026-10-03");
    await act(async () => host.querySelector<HTMLButtonElement>(".calendar-today-button")!.click());
    expect(window.location.pathname).toBe("/ui/calendar");
    expect(window.location.search).toBe("?date=2026-10-02");
    expect(host.querySelector(".calendar-lesson.is-highlighted")).toBeNull();
    expect(host.querySelector(".old-version-link")).toBeNull();
  });

  it("repairs an invalid calendar date using the canonical route", async () => {
    window.history.replaceState(null, "", "/ui/calendar?date=invalid");
    await act(async () => root.render(<CalendarApp boot={{ ...boot, initialDate: "invalid", initialLesson: null }} />));
    expect(window.location.pathname).toBe("/ui/calendar");
    expect(window.location.search).toBe("?date=2026-10-02");
  });

  it("preserves a task filter in edit links and switches to the canonical full list for a newly created task", async () => {
    vi.mocked(getTasks).mockResolvedValue([{ ...task, status: "done" }]);
    vi.mocked(createTask).mockResolvedValue({ ...task, id: 13, title: "Новая задача", due_at: null });
    window.history.replaceState(null, "", "/ui/tasks?filter=done");
    await act(async () => root.render(<TasksApp boot={{ ...boot, initialFilter: "done" }} />));
    expect(linkUrl('.tasks-filters a[aria-current="page"]').searchParams.get("filter")).toBe("done");
    expect(linkUrl(".tasks-ledger-title").searchParams.get("return_to")).toBe("/ui/tasks?filter=done");
    await act(async () => host.querySelector<HTMLButtonElement>(".tasks-create")!.click());
    const input = host.querySelector<HTMLInputElement>("#task-create-title")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Новая задача");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => host.querySelector("dialog form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(createTask).toHaveBeenCalledWith({ title: "Новая задача", body: null, due_at: null, subject: null }, boot.csrfToken);
    expect(window.location.pathname).toBe("/ui/tasks");
    expect(window.location.search).toBe("");
    expect(host.querySelector('.tasks-filters a[aria-current="page"]')!.getAttribute("href")).toBe("/ui/tasks");
    expect(host.textContent).toContain("Задача добавлена. Открыт список всех задач.");
  });

  it("closes the profile editor on its canonical profile URL and restores heading focus", async () => {
    window.history.replaceState(null, "", "/ui/profile?edit=1");
    await act(async () => root.render(<ProfileApp boot={{ ...boot, profile, initialEdit: true }} />));
    expect(host.querySelector("h1")!.textContent).toBe("Редактирование профиля");
    expect(host.querySelector(".profile-back")!.getAttribute("href")).toBe("/ui/profile");
    const cancel = Array.from(host.querySelectorAll<HTMLButtonElement>("form button")).find(button => button.textContent === "Отмена")!;
    await act(async () => cancel.click());
    expect(window.location.pathname).toBe("/ui/profile");
    expect(window.location.search).toBe("");
    expect(host.querySelector("h1")!.textContent).toBe("Профиль");
    expect(document.activeElement).toBe(host.querySelector("h1"));
    expect(host.querySelector(".old-version-link")).toBeNull();
  });
});
