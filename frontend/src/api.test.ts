import { afterEach, describe, expect, it, vi } from "vitest";
import { completeTask, getTasks, UnauthorizedError } from "./api";

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
