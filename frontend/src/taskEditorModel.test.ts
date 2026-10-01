import { describe, expect, it } from "vitest";
import { blankTaskFields, fieldsFromTask, matchingSubjects, moscowLocalDateTime, newTaskPayload, subjectNames, taskPatchPayload, taskPayload } from "./taskEditorModel";
import type { Lesson, Schedule, Task } from "./types";

const task: Task = {
  id: 8,
  title: "  Лабораторная  ",
  body: "Описание",
  due_at: "2026-09-24T21:30:45Z",
  subject: "Архитектура ПО",
  status: "todo",
  created_at: "2026-09-22T09:00:00Z",
  updated_at: "2026-09-22T09:00:00Z",
};

describe("task editor values", () => {
  it("shows a UTC deadline as Moscow wall time even across midnight", () => {
    expect(moscowLocalDateTime(task.due_at)).toBe("2026-09-25T00:30");
    expect(moscowLocalDateTime(null)).toBe("");
    expect(fieldsFromTask(task)).toMatchObject({ dueAt: "2026-09-25T00:30", subject: "Архитектура ПО" });
  });

  it("trims text and explicitly clears an empty deadline", () => {
    expect(taskPayload({ ...blankTaskFields(), title: "  Сделать отчёт  ", body: "  ", subject: "  ", status: "done" })).toEqual({
      title: "Сделать отчёт",
      body: null,
      due_at: null,
      subject: null,
      status: "done",
    });
  });

  it("keeps server-side seconds when the visible deadline was not changed", () => {
    const baseline = fieldsFromTask(task);
    expect(taskPatchPayload({ ...baseline, title: "Новое название" }, baseline)).not.toHaveProperty("due_at");
    expect(taskPatchPayload({ ...baseline, dueAt: "" }, baseline)).toHaveProperty("due_at", null);
  });

  it("creates the same payload from the dialog and standalone form without edit status", () => {
    const fields = { ...blankTaskFields("  Базы данных  ", "2026-10-02T18:00"), title: "  Сдать работу  " };
    expect(newTaskPayload(fields)).toEqual({ title: "Сдать работу", body: null, subject: "Базы данных", due_at: "2026-10-02T18:00" });
    expect(newTaskPayload({ ...fields, dueAt: "" })).toHaveProperty("due_at", null);
    expect(newTaskPayload(fields)).not.toHaveProperty("status");
  });
});

describe("subject suggestions", () => {
  it("deduplicates and sorts subjects from the schedule", () => {
    const lesson = (name: string): Lesson => ({ name, weeks: [], time_start: "", time_end: "", types: "", teachers: [], rooms: [] });
    const schedule: Schedule = {
      group: "ИКБО-14-23",
      schedule: {
        "1": { lessons: [[lesson("Тестирование"), lesson("Алгоритмы")]] },
        "2": { lessons: [[lesson("Тестирование"), lesson("  ")]] },
      },
    };
    expect(subjectNames(schedule)).toEqual(["Алгоритмы", "Тестирование"]);
  });

  it("matches without case and punctuation and limits suggestions", () => {
    expect(matchingSubjects(["Базы данных", "Базы-данных II", "Алгоритмы"], "БАЗЫ ДАННЫХ", 1)).toEqual(["Базы данных"]);
  });
});
