import { describe, expect, it, vi } from "vitest";
import { academicWeekNumber, formatDate, formatDue, lessonsForDate, moscowDateKey, weekDates } from "./dates";
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

describe("date formatter reuse", () => {
  it("constructs one formatter for repeated, canonically equivalent options", async () => {
    vi.resetModules();
    const { formatDate: formatFreshDate } = await import("./dates");
    const constructors = vi.spyOn(Intl, "DateTimeFormat");
    try {
      expect(formatFreshDate("2026-09-03", { weekday: "long", day: "numeric", month: "long" })).toBe("четверг, 3 сентября");
      expect(formatFreshDate("2026-09-04", { weekday: "long", day: "numeric", month: "long" })).toBe("пятница, 4 сентября");
      expect(formatFreshDate("2026-09-03", { month: "long", day: "numeric", weekday: "long", timeZone: "UTC" })).toBe("четверг, 3 сентября");
      expect(constructors).toHaveBeenCalledTimes(1);
      expect(constructors).toHaveBeenCalledWith("ru-RU", {
        timeZone: "UTC", weekday: "long", day: "numeric", month: "long",
      });
    } finally {
      constructors.mockRestore();
    }
  });

  it("retains 32 distinct option sets and evicts older formatters without changing output", async () => {
    vi.resetModules();
    const { formatDate: formatFreshDate } = await import("./dates");
    const originalFormatter = Intl.DateTimeFormat;
    const days = ["numeric", "2-digit"] as const;
    const months = ["numeric", "2-digit", "long", "short", "narrow"] as const;
    const weekdays = [undefined, "long", "short", "narrow"] as const;
    const options = days.flatMap((day) => months.flatMap((month) => weekdays.map((weekday) => ({ day, month, weekday })))).slice(0, 33);
    const expected = options.map((option) => new originalFormatter("ru-RU", { timeZone: "UTC", ...option }).format(new Date("2026-09-03T00:00:00Z")));
    const constructors = vi.spyOn(Intl, "DateTimeFormat");
    try {
      options.forEach((option, index) => expect(formatFreshDate("2026-09-03", option)).toBe(expected[index]));
      expect(constructors).toHaveBeenCalledTimes(33);

      options.slice(1).forEach((option, index) => expect(formatFreshDate("2026-09-03", option)).toBe(expected[index + 1]));
      expect(constructors).toHaveBeenCalledTimes(33);

      expect(formatFreshDate("2026-09-03", options[0])).toBe(expected[0]);
      expect(constructors).toHaveBeenCalledTimes(34);
      expect(formatFreshDate("2026-09-03", options[1])).toBe(expected[1]);
      expect(constructors).toHaveBeenCalledTimes(35);
    } finally {
      constructors.mockRestore();
    }
  });
});

describe("date formatting", () => {
  it("keeps date-only labels in Russian and UTC", () => {
    expect(formatDate("2026-09-03", { weekday: "long", day: "numeric", month: "long" })).toBe("четверг, 3 сентября");
    expect(formatDate("2026-09-03", { day: "numeric" })).toBe("3");
    expect(formatDate("2026-09-03", { month: "long", day: "numeric", weekday: "long" })).toBe("четверг, 3 сентября");
    expect(formatDate("2026-09-04", { day: "numeric" })).toBe("4");
  });

  it("respects explicit time zones and distinct formatter options", () => {
    expect(formatDate("2026-09-03", { day: "numeric", timeZone: "America/Los_Angeles" })).toBe("2");
    expect(formatDate("2026-09-03", { day: "numeric", timeZone: "Europe/Moscow" })).toBe("3");
    expect(formatDate("2026-09-03", { month: "long" })).toBe("сентябрь");
    expect(formatDate("2026-09-03", { day: "numeric", timeZone: "America/Los_Angeles" })).toBe("2");
  });

  it("uses Moscow's midnight and calendar day for relative due labels", () => {
    expect(formatDue(null, "2026-09-03")).toBe("Без срока");
    expect(formatDue("2026-09-03T20:59:00Z", "2026-09-03")).toBe("Сегодня, 23:59");
    expect(formatDue("2026-09-03T21:00:00Z", "2026-09-03")).toBe("Завтра, 00:00");
    expect(formatDue("2026-09-04T01:30:00+03:00", "2026-09-04")).toBe("Сегодня, 01:30");
    expect(formatDue("2026-09-30T21:00:00Z", "2026-09-30")).toBe("Завтра, 00:00");
    expect(formatDue("2026-09-04T15:30:00Z", "2026-09-02")).toBe("4 сент., 18:30");
  });

  it("preserves errors for invalid dates and formatter options", () => {
    expect(() => moscowDateKey("invalid")).toThrow(RangeError);
    expect(() => formatDue("invalid", "2026-09-03")).toThrow(RangeError);
    expect(() => formatDate("invalid", { day: "numeric" })).toThrow(RangeError);
    expect(() => formatDate("2026-09-03", { timeZone: "Invalid/Zone" })).toThrow(RangeError);
    expect(formatDate("2026-09-03", { day: "numeric" })).toBe("3");
  });
});
