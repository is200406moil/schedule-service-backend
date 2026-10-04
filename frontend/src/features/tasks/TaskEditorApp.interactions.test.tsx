// @vitest-environment jsdom
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createTask, getSchedule, getTask, UnauthorizedError, updateTask } from "../../shared/api";
import type { Schedule, Task, TaskEditorBootData } from "../../shared/types";
import { TaskEditorApp } from "./TaskEditorApp";

vi.mock("../../shared/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../shared/api")>(),
  createTask: vi.fn(),
  getSchedule: vi.fn(),
  getTask: vi.fn(),
  updateTask: vi.fn(),
}));
vi.mock("../../shared/Shell", () => ({
  Shell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const boot: TaskEditorBootData = {
  firstName: "Студент", group: "", avatar: "", today: "2026-10-02",
  csrfToken: "editor-csrf", taskId: null, returnTo: "#saved", initialSubject: null,
};
const task: Task = {
  id: 12, title: "Лабораторная", body: "Первый вариант", subject: "Базы данных", status: "todo",
  due_at: "2026-10-03T10:45:30Z", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z",
};
const schedule: Schedule = {
  group: "ИКБО-14-23",
  schedule: {
    "2026-10-02": { lessons: [[{ name: "Базы данных", weeks: [], time_start: "09:00", time_end: "10:30", types: "лк", teachers: [], rooms: [] }]] },
  },
};
let host: HTMLDivElement;
let root: Root;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function field(id: string) {
  return host.querySelector<HTMLInputElement>(`#task-editor-${id}`)!;
}

async function typeInto(input: HTMLInputElement, value: string) {
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  await act(() => {
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  vi.mocked(getTask).mockResolvedValue(task);
  vi.mocked(getSchedule).mockResolvedValue(schedule);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("task editor interactions", () => {
  it("retains the full canonical return destination in back, cancel and missing-task links", async () => {
    const returnTo = "/ui/calendar?date=2026-10-03&lesson=09%3A00#main";
    await act(() => root.render(<TaskEditorApp boot={{ ...boot, returnTo, initialSubject: "Алгоритмы" }} />));
    expect(host.querySelector(".task-editor-back")!.getAttribute("href")).toBe(returnTo);
    expect(host.querySelector(".task-editor-actions a")!.getAttribute("href")).toBe(returnTo);
    expect(field("subject").value).toBe("Алгоритмы");
    expect(host.querySelector(".old-version-link")).toBeNull();
    vi.mocked(getTask).mockRejectedValue(new ApiError(404));
    await act(() => root.render(<TaskEditorApp boot={{ ...boot, taskId: 12, returnTo }} />));
    expect(host.querySelector(".task-editor-load-error a")!.getAttribute("href")).toBe(returnTo);
  });

  it("loads task and subject suggestions independently and aborts both requests on cleanup", async () => {
    const taskRequest = deferred<Task>();
    const scheduleRequest = deferred<Schedule>();
    vi.mocked(getTask).mockReturnValue(taskRequest.promise);
    vi.mocked(getSchedule).mockReturnValue(scheduleRequest.promise);
    await act(() => root.render(<TaskEditorApp boot={{ ...boot, taskId: 12, group: schedule.group, initialSubject: "Алгоритмы" }} />));

    expect(host.querySelector('[aria-label="Загружаем задачу"]')).not.toBeNull();
    expect(getTask).toHaveBeenCalledWith(12, expect.any(AbortSignal));
    expect(getSchedule).toHaveBeenCalledWith(schedule.group, expect.any(AbortSignal));
    await act(() => { taskRequest.resolve(task); });
    expect(field("title").value).toBe("Лабораторная");
    expect(field("subject").value).toBe("Алгоритмы");
    await typeInto(field("subject"), "");
    await act(() => { scheduleRequest.resolve(schedule); });
    expect(host.querySelector('option[value="Базы данных"]')).not.toBeNull();

    const taskSignal = vi.mocked(getTask).mock.calls[0][1]!;
    const scheduleSignal = vi.mocked(getSchedule).mock.calls[0][1]!;
    await act(() => root.unmount());
    expect(taskSignal.aborted).toBe(true);
    expect(scheduleSignal.aborted).toBe(true);
  });

  it("retries a task load without repeating the schedule request", async () => {
    vi.mocked(getTask).mockRejectedValueOnce(new Error("offline"));
    await act(() => root.render(<TaskEditorApp boot={{ ...boot, taskId: 12, group: schedule.group }} />));
    expect(host.textContent).toContain("Не удалось загрузить задачу");
    await act(() => host.querySelector<HTMLButtonElement>(".task-editor-load-error button")!.click());
    expect(getTask).toHaveBeenCalledTimes(2);
    expect(getSchedule).toHaveBeenCalledTimes(1);
    expect(field("title").value).toBe(task.title);
  });

  it("resets edited fields when another task finishes loading in the same React batch", async () => {
    vi.mocked(getTask).mockResolvedValueOnce(task).mockResolvedValueOnce({ ...task, id: 13, title: "Другой отчёт" });
    await act(() => root.render(<TaskEditorApp boot={{ ...boot, taskId: 12 }} />));
    await typeInto(field("title"), "Несохранённые изменения");
    await act(() => root.render(<TaskEditorApp boot={{ ...boot, taskId: 13 }} />));
    expect(field("title").value).toBe("Другой отчёт");
  });

  it("validates and focuses title and deadline before making a save request", async () => {
    await act(() => root.render(<TaskEditorApp boot={boot} />));
    await submit();
    expect(document.activeElement).toBe(field("title"));
    expect(host.textContent).toContain("Напишите название задачи.");
    expect(createTask).not.toHaveBeenCalled();

    const title = field("title");
    await typeInto(title, "Новая задача");
    expect(field("title")).toBe(title);
    expect(host.querySelector(".task-editor-preview strong")!.textContent).toBe("Новая задача");
    field("due").setCustomValidity("invalid date");
    await submit();
    expect(document.activeElement).toBe(field("due"));
    expect(host.textContent).toContain("Проверьте дату и время.");
    expect(createTask).not.toHaveBeenCalled();
  });

  it("passes CSRF with a create request, prevents duplicate save, and retains fields after a server error", async () => {
    const request = deferred<Task>();
    vi.mocked(createTask).mockReturnValueOnce(request.promise).mockResolvedValueOnce(task);
    await act(() => root.render(<TaskEditorApp boot={{ ...boot, initialSubject: "Алгоритмы" }} />));
    await typeInto(field("title"), "  Новый отчёт  ");
    await act(() => {
      const form = host.querySelector("form")!;
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(createTask).toHaveBeenCalledWith({ title: "Новый отчёт", body: null, due_at: null, subject: "Алгоритмы" }, "editor-csrf");
    expect([...host.querySelectorAll<HTMLInputElement | HTMLButtonElement>("form input, form textarea, form button")].every(input => input.disabled)).toBe(true);
    await submit();
    expect(createTask).toHaveBeenCalledTimes(1);

    await act(() => { request.reject(new ApiError(422)); });
    expect(host.textContent).toContain("Проверьте название, срок и длину заполненных полей.");
    expect(field("title").value).toBe("  Новый отчёт  ");
    expect(field("title").disabled).toBe(false);
    await typeInto(field("title"), "Исправленный отчёт");
    expect(host.querySelector(".task-editor-save-error")).toBeNull();
    await submit();
    expect(createTask).toHaveBeenCalledTimes(2);
    expect(window.location.hash).toBe("#saved");
  });

  it("preserves an unchanged server deadline on edit and stops the unsaved warning after successful save", async () => {
    const request = deferred<Task>();
    vi.mocked(updateTask).mockReturnValue(request.promise);
    await act(() => root.render(<TaskEditorApp boot={{ ...boot, taskId: 12 }} />));
    expect(field("due").value).toBe("2026-10-03T13:45");
    await act(() => field("done").click());
    const beforeSave = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeSave);
    expect(beforeSave.defaultPrevented).toBe(true);

    await submit();
    expect(updateTask).toHaveBeenCalledWith(12, {
      title: task.title, body: task.body, subject: task.subject, status: "done",
    }, "editor-csrf");
    await act(() => { request.resolve({ ...task, status: "done" }); });
    expect(window.location.hash).toBe("#saved");
    const afterSave = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(afterSave);
    expect(afterSave.defaultPrevented).toBe(false);
    await submit();
    expect(updateTask).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new ApiError(403), "Не удалось подтвердить запрос. Обновите страницу и повторите.", true],
    [new ApiError(404), "Задача не найдена", false],
    [new UnauthorizedError(), "Нужно войти снова", false],
  ])("handles a rejected save %s without navigating", async (error, message, retainsForm) => {
    vi.mocked(createTask).mockRejectedValue(error);
    await act(() => root.render(<TaskEditorApp boot={boot} />));
    await typeInto(field("title"), "Несохранённая задача");
    await submit();
    expect(host.textContent).toContain(message);
    expect(Boolean(host.querySelector("form"))).toBe(retainsForm);
    expect(window.location.hash).toBe("");
  });

  it.each([
    [new ApiError(404), "Задача не найдена"],
    [new UnauthorizedError(), "Нужно войти снова"],
  ])("shows the terminal load state for %s", async (error, message) => {
    vi.mocked(getTask).mockRejectedValue(error);
    await act(() => root.render(<TaskEditorApp boot={{ ...boot, taskId: 12 }} />));
    expect(host.textContent).toContain(message);
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector(".task-editor-load-error button")).toBeNull();
  });
});
