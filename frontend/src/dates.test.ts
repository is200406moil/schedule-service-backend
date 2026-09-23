import { describe, expect, it } from "vitest";
import { academicWeekNumber, lessonsForDate, moscowDateKey, weekDates } from "./dates";
import type { Schedule } from "./types";

describe("semester dates", () => {
  it("builds Monday-first weeks across month boundaries", () => {
    expect(weekDates("2026-09-01")).toEqual([
      "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03",
      "2026-09-04", "2026-09-05", "2026-09-06",
    ]);
  });

  it("keeps January in the autumn semester", () => {
    expect(academicWeekNumber("2027-01-04")).toBe(19);
    expect(academicWeekNumber("2027-02-01")).toBe(23);
  });

  it("uses Moscow time for task dates", () => {
    expect(moscowDateKey("2026-09-03T22:30:00Z")).toBe("2026-09-04");
  });

  it("selects only lessons for the current parity", () => {
    const schedule: Schedule = {
      group: "ИКБО-14-23",
      schedule: {
        "1": { lessons: [[
          { name: "Нечётная", weeks: [1], time_start: "09:00", time_end: "10:30", types: "", teachers: [], rooms: [] },
          { name: "Чётная", weeks: [2], time_start: "09:00", time_end: "10:30", types: "", teachers: [], rooms: [] },
        ]] },
      },
    };
    expect(lessonsForDate(schedule, "2026-09-07").map((lesson) => lesson.name)).toEqual(["Чётная"]);
  });
});
