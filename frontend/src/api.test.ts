import { afterEach, describe, expect, it, vi } from "vitest";
import { completeTask, getTasks, setTaskStatus, UnauthorizedError } from "./api";

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
