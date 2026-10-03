import { describe, expect, it } from "vitest";
import { isSelectableCalendarDate, monthDates, monthLabel, moscowTime, parseCalendarDate, shiftMonth } from "./calendarDates";

describe("calendar dates", () => {
  it("accepts only real, zero-padded dates from the URL", () => {
    expect(parseCalendarDate("2024-02-29", "2026-09-03")).toBe("2024-02-29");
    expect(parseCalendarDate("1900-01-01", "2026-09-03")).toBe("1900-01-01");
    expect(parseCalendarDate("2100-12-31", "2026-09-03")).toBe("2100-12-31");
    for (const invalid of [null, "2026-2-3", "2026-02-29", "2026-04-31", "2026-13-01", "0000-01-01", "0001-09-01", "1899-12-31", "2101-01-01", "9999-12-31", "2026-09-03&lesson=09:00"]) {
      expect(parseCalendarDate(invalid, "2026-09-03")).toBe("2026-09-03");
    }
    expect(() => parseCalendarDate(null, "2026-02-29")).toThrow(RangeError);
    expect(() => parseCalendarDate(null, "9999-12-31")).toThrow(RangeError);
  });

  it("builds a fixed six-week, Monday-first grid across month boundaries", () => {
    const september = monthDates("2026-09-23");
    expect(september).toHaveLength(42);
    expect(september.slice(0, 7)).toEqual([
      "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03",
      "2026-09-04", "2026-09-05", "2026-09-06",
    ]);
    expect(september.at(-1)).toBe("2026-10-11");
    const january = monthDates("2027-01-01");
    expect(january[0]).toBe("2026-12-28");
    expect(january.at(-1)).toBe("2027-02-07");
    expect(monthDates("2024-02-29")).toContain("2024-02-29");
    expect(() => monthDates("2026-02-29")).toThrow(RangeError);
    const lastMonth = monthDates("2100-12-01");
    expect(lastMonth).toHaveLength(42);
    expect(lastMonth).toContain("2100-12-31");
    expect(lastMonth.some((day) => day.startsWith("2101-"))).toBe(true);
    expect(isSelectableCalendarDate("2100-12-31")).toBe(true);
    expect(isSelectableCalendarDate("2101-01-01")).toBe(false);
    expect(isSelectableCalendarDate("1899-12-31")).toBe(false);
    expect(isSelectableCalendarDate("0001-09-01")).toBe(false);
    expect(isSelectableCalendarDate("9999-12-31")).toBe(false);
    expect(() => monthDates("9999-12-01")).toThrow(RangeError);
  });

  it("shifts months from the first day, including year boundaries", () => {
    expect(shiftMonth("2026-01-31", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftMonth("2024-02-29", 0)).toBe("2024-02-01");
    expect(shiftMonth("1900-01-01", -1)).toBe("1900-01-01");
    expect(shiftMonth("1900-01-01", -1000)).toBe("1900-01-01");
    expect(shiftMonth("2100-12-31", 1)).toBe("2100-12-01");
    expect(shiftMonth("2100-12-31", 1000)).toBe("2100-12-01");
    expect(() => shiftMonth("2026-09-01", 0.5)).toThrow(RangeError);
  });

  it("labels months in Russian and formats task times in Moscow", () => {
    expect(monthLabel("2026-09-23")).toBe("Сентябрь 2026");
    expect(() => monthLabel("0001-09-01")).toThrow(RangeError);
    expect(moscowTime("2026-09-03T15:30:00Z")).toBe("18:30");
    expect(moscowTime("2026-09-03T21:00:00Z")).toBe("00:00");
    expect(moscowTime("2026-09-03T22:30:00Z")).toBe("01:30");
    expect(moscowTime("2026-09-04T01:30:00+03:00")).toBe("01:30");
    expect(moscowTime("2026-09-03T20:59:00Z")).toBe("23:59");
    expect(() => moscowTime("invalid")).toThrow(RangeError);
    expect(() => moscowTime("")).toThrow(RangeError);
  });
});
