import { afterEach, describe, expect, it, vi } from "vitest";
import { completeTask, deleteTask, getTasks, setTaskStatus, UnauthorizedError } from "./api";

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
