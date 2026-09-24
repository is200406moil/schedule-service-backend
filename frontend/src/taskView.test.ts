import { describe, expect, it } from "vitest";
import { deriveTaskView, normalizeTaskFilter } from "./taskView";
import type { Task } from "./types";

const today = "2026-09-24";
const now = new Date("2026-09-24T12:00:00Z");

function task(id: number, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    body: null,
    subject: null,
    status: "todo",
    due_at: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("task list view", () => {
  it("counts a past-due Moscow-today task as overdue but groups it under Today", () => {
    const earlierToday = task(1, { due_at: "2026-09-23T22:30:00Z" });
    const tomorrow = task(2, { due_at: "2026-09-24T22:30:00Z" });
    const completed = task(3, { status: "done", due_at: "2026-09-23T20:00:00Z" });
    const tasks = [earlierToday, tomorrow, completed];

    const all = deriveTaskView(tasks, "all", today, now);
    expect(all.counts).toEqual({ all: 3, active: 2, today: 1, overdue: 1, done: 1 });
    expect(all.sections.map((section) => section.key)).toEqual(["today", "upcoming", "done"]);

    const overdue = deriveTaskView(tasks, "overdue", today, now);
    expect(overdue.counts).toEqual(all.counts);
    expect(overdue.sections.map((section) => [section.key, section.items.map((item) => item.id)]))
      .toEqual([["today", [1]]]);
    expect(deriveTaskView(tasks, "today", today, now).sections[0]?.items).toEqual([earlierToday]);
  });

  it("orders sections and tasks like the server-rendered list", () => {
    const tasks = [
      task(5, { due_at: "2026-09-27T15:00:00Z" }),
      task(8, { status: "done", updated_at: "2026-09-20T10:00:00Z" }),
      task(1, { due_at: "2026-09-23T18:00:00Z" }),
      task(6, { created_at: "2026-09-20T10:00:00Z" }),
      task(4, { due_at: "2026-09-25T09:00:00Z" }),
      task(2, { due_at: "2026-09-22T18:00:00Z" }),
      task(9, { status: "done", updated_at: "2026-09-21T10:00:00Z" }),
      task(7, { created_at: "2026-09-21T10:00:00Z" }),
      task(3, { due_at: "2026-09-24T15:00:00Z" }),
    ];
    const originalOrder = tasks.map((item) => item.id);

    const view = deriveTaskView(tasks, "all", today, now);

    expect(view.sections.map((section) => [section.key, section.items.map((item) => item.id)]))
      .toEqual([
        ["overdue", [2, 1]],
        ["today", [3]],
        ["upcoming", [4, 5]],
        ["no_due", [7, 6]],
        ["done", [9, 8]],
      ]);
    expect(tasks.map((item) => item.id)).toEqual(originalOrder);
  });

  it("falls back to all for an unknown filter and excludes done tasks from active", () => {
    const tasks = [task(1), task(2, { status: "done" })];

    expect(normalizeTaskFilter("unexpected")).toBe("all");
    expect(deriveTaskView(tasks, "unexpected", today, now).filter).toBe("all");
    expect(deriveTaskView(tasks, "unexpected", today, now).sections.map((section) => section.key))
      .toEqual(["no_due", "done"]);
    expect(deriveTaskView(tasks, "active", today, now).sections[0]?.items.map((item) => item.id))
      .toEqual([1]);
    expect(deriveTaskView(tasks, "done", today, now).sections[0]?.items.map((item) => item.id))
      .toEqual([2]);
  });
});
