import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, completeTask, createTask, deleteTask, getTask, getTasks, setTaskStatus, UnauthorizedError, updateTask } from "./api";
import type { Task, TaskEditPayload } from "./types";

const task: Task = {
  id: 3,
  title: "Подготовить отчёт",
  body: null,
  subject: null,
  status: "todo",
  due_at: null,
  created_at: "2026-09-03T12:00:00Z",
  updated_at: "2026-09-03T12:00:00Z",
};

const editPayload: TaskEditPayload = {
  title: "Обновить отчёт",
  body: "Добавить выводы",
  subject: "Алгоритмы",
  due_at: null,
  status: "done",
};

afterEach(() => vi.unstubAllGlobals());

describe("expired session", () => {
  it("distinguishes an expired session when loading tasks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    await expect(getTasks()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("distinguishes an expired session when completing a task", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    await expect(completeTask(3, "test-token")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("distinguishes an expired session when editing a task", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    await expect(updateTask(3, editPayload, "test-token")).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("task editor API", () => {
  it("loads one task with same-origin credentials and an abort signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(task), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;

    await expect(getTask(3, signal)).resolves.toEqual(task);
    expect(fetchMock).toHaveBeenCalledWith("/tasks/3", { credentials: "same-origin", signal });
  });

  it("submits all editable fields with the CSRF token", async () => {
    const updated = { ...task, ...editPayload };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(updated), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateTask(3, editPayload, "test-token")).resolves.toEqual(updated);
    expect(fetchMock).toHaveBeenCalledWith("/tasks/3", {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "test-token",
      },
      body: JSON.stringify(editPayload),
    });
  });

  it("allows creating a task without a deadline", async () => {
    const data = { title: "Без срока", body: null, subject: null, due_at: null };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(task), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createTask(data, "test-token")).resolves.toEqual(task);
    expect(fetchMock).toHaveBeenCalledWith("/tasks", expect.objectContaining({ body: JSON.stringify(data) }));
  });

  it("exposes a missing task as a 404 API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    const request = getTask(3);

    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({ status: 404, message: "Request failed: 404" });
  });

  it("exposes invalid edits as a 422 API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 422 })));
    const request = updateTask(3, editPayload, "test-token");

    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({ status: 422, message: "Request failed: 422" });
  });
});

describe("task status", () => {
  it("can restore a completed task with the CSRF token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await setTaskStatus(3, "todo", "test-token");

    expect(fetchMock).toHaveBeenCalledWith("/tasks/3", expect.objectContaining({
      method: "PATCH",
      credentials: "same-origin",
      headers: expect.objectContaining({ "X-CSRF-Token": "test-token" }),
      body: JSON.stringify({ status: "todo" }),
    }));
  });
});

describe("delete task", () => {
  it("sends a DELETE request with same-origin credentials and the CSRF token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteTask(3, "test-token")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith("/tasks/3", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "X-CSRF-Token": "test-token" },
    });
  });

  it("throws UnauthorizedError when the session expires", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));

    await expect(deleteTask(3, "test-token")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("reports other HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));

    await expect(deleteTask(3, "test-token")).rejects.toThrow("Request failed: 500");
  });
});
