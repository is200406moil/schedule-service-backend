import { describe, expect, it } from "vitest";
import { keyedLessons } from "./lessonIdentity";
import { buildLessonTimeline } from "./lessonTimeline";
import type { Lesson } from "./types";

function lesson(name: string, time_start: string, time_end: string): Lesson {
  return {
    name, time_start, time_end, types: "Лекция", weeks: [1, 2],
    teachers: ["Иванов"], rooms: ["А-101"],
  };
}

const dailyLessons = [
  lesson("Математика", "09:00", "10:30"),
  lesson("Физика", "10:40", "12:10"),
  lesson("История", "12:40", "14:10"),
  lesson("Информатика", "14:20", "15:50"),
];

function breaks(lessons: readonly Lesson[]) {
  return buildLessonTimeline(lessons).filter((entry) => entry.kind === "break");
}

describe("lesson timeline", () => {
  it("shows actual 10, 30 and 10 minute gaps between the university slots", () => {
    const timeline = buildLessonTimeline(dailyLessons);
    expect(timeline.map((entry) => entry.kind)).toEqual([
      "lesson", "break", "lesson", "break", "lesson", "break", "lesson",
    ]);
    expect(breaks(dailyLessons).map(({ minutes, label }) => ({ minutes, label }))).toEqual([
      { minutes: 10, label: "10 мин" },
      { minutes: 30, label: "30 мин" },
      { minutes: 10, label: "10 мин" },
    ]);
    expect(timeline.filter((entry) => entry.kind === "lesson")).toEqual(
      keyedLessons(dailyLessons).map((entry) => ({ kind: "lesson", ...entry })),
    );
  });

  it("keeps chronological rows and their keys stable across API reordering", () => {
    const unordered = [dailyLessons[3], dailyLessons[1], dailyLessons[0], dailyLessons[2]];
    expect(buildLessonTimeline(unordered)).toEqual(buildLessonTimeline(dailyLessons));
  });

  it("preserves the API order of simultaneous distinct lessons", () => {
    const parallel = lesson("Практика", "09:00", "10:20");
    const original = [dailyLessons[0], parallel, dailyLessons[1]];
    const reordered = [dailyLessons[1], parallel, dailyLessons[0]];
    const names = (lessons: Lesson[]) => buildLessonTimeline(lessons)
      .filter((entry) => entry.kind === "lesson").map((entry) => entry.lesson.name);
    expect(names(original)).toEqual(["Математика", "Практика", "Физика"]);
    expect(names(reordered)).toEqual(["Практика", "Математика", "Физика"]);
    expect(breaks(original).map((entry) => entry.minutes)).toEqual([10]);
    expect(breaks(reordered).map((entry) => entry.minutes)).toEqual([10]);
  });

  it("uses the furthest end of nested lessons instead of the last rendered row", () => {
    const lessons = [
      lesson("Длинная пара", "09:00", "12:10"),
      lesson("Первая подгруппа", "10:00", "10:30"),
      lesson("Вторая подгруппа", "11:00", "11:30"),
      dailyLessons[2],
    ];
    expect(breaks(lessons).map((entry) => entry.minutes)).toEqual([30]);
  });

  it("extends the frontier across partial overlaps", () => {
    const lessons = [
      dailyLessons[0],
      lesson("Перекрывающая пара", "10:20", "12:10"),
      dailyLessons[2],
    ];
    expect(breaks(lessons).map((entry) => entry.minutes)).toEqual([30]);
  });

  it("does not invent a gap between touching or overlapping lessons", () => {
    const lessons = [
      dailyLessons[0],
      lesson("Без перерыва", "10:30", "12:10"),
      lesson("Перекрытие", "12:00", "14:10"),
    ];
    expect(breaks(lessons)).toEqual([]);
  });

  it("shows the complete free interval when intervening slots are absent", () => {
    expect(breaks([dailyLessons[0], dailyLessons[2]])).toMatchObject([
      { minutes: 130, label: "2 ч 10 мин" },
    ]);
    expect(breaks([lesson("Первая", "09:00", "10:00"), lesson("Вторая", "12:00", "13:00")]))
      .toMatchObject([{ minutes: 120, label: "2 ч" }]);
  });

  it("accepts seconds and mixes HH:MM with HH:MM:SS", () => {
    const lessons = [
      lesson("Первая", "09:00", "10:30:20"),
      lesson("Вторая", "10:40:20", "12:10:00"),
    ];
    expect(breaks(lessons)).toMatchObject([{ minutes: 10, label: "10 мин" }]);
  });

  it("omits subminute gaps and never overstates partial minutes", () => {
    const lessons = [
      lesson("Первая", "09:00:00", "10:30:30"),
      lesson("Вторая", "10:30:59", "12:10:00"),
      lesson("Третья", "12:11:30", "14:10:00"),
    ];
    expect(breaks(lessons)).toMatchObject([{ minutes: 1, label: "1 мин" }]);
  });

  it.each(["", "9:00", "24:00", "09:60", "09:00:60", "09:00:0", " 09:00", "09:00Z"])(
    "preserves an unknown start %j without claiming the other rows have free gaps",
    (invalidTime) => {
      const unknown = lesson("Неизвестное начало", invalidTime, "10:30");
      const timeline = buildLessonTimeline([dailyLessons[1], unknown, dailyLessons[0]]);
      expect(timeline.map((entry) => entry.kind)).toEqual(["lesson", "lesson", "lesson"]);
      expect(timeline).toContainEqual(expect.objectContaining({ kind: "lesson", lesson: unknown }));
      expect(timeline.filter((entry) => entry.kind === "lesson").map((entry) => entry.lesson)).toEqual(
        [dailyLessons[1], unknown, dailyLessons[0]].sort((left, right) => left.time_start.localeCompare(right.time_start)),
      );
    },
  );

  it.each(["", "n/a", "12:60", "24:00:00", "10:39", "10:40"])(
    "does not claim any later gaps after an invalid end %j",
    (invalidTime) => {
      const uncertain = lesson("Неизвестное окончание", "10:40", invalidTime);
      const timeline = buildLessonTimeline([dailyLessons[2], uncertain, dailyLessons[0]]);
      // The prior 10 minute gap remains known; the uncertain row's end cannot bound another.
      expect(breaks([dailyLessons[2], uncertain, dailyLessons[0]])).toMatchObject([
        { minutes: 10, label: "10 мин" },
      ]);
      expect(timeline.filter((entry) => entry.kind === "lesson")).toHaveLength(3);
    },
  );

  it("retains duplicate lesson rows with distinct, stable lesson and break keys", () => {
    const duplicate = { ...dailyLessons[0], rooms: [...dailyLessons[0].rooms] };
    const initial = buildLessonTimeline([dailyLessons[0], duplicate, dailyLessons[1]]);
    const reordered = buildLessonTimeline([dailyLessons[1], duplicate, dailyLessons[0]]);
    expect(initial.filter((entry) => entry.kind === "lesson")).toHaveLength(3);
    expect(new Set(initial.map((entry) => entry.key)).size).toBe(initial.length);
    expect(reordered.map((entry) => entry.key)).toEqual(initial.map((entry) => entry.key));
    expect(initial.filter((entry) => entry.kind === "break")).toMatchObject([{ minutes: 10 }]);
  });

  it("leaves frozen input order, objects and nested lesson fields untouched", () => {
    const later = Object.freeze({ ...dailyLessons[1], weeks: Object.freeze([2, 1]) as unknown as number[] });
    const earlier = Object.freeze({ ...dailyLessons[0] });
    const input = Object.freeze([later, earlier]);
    const snapshot = JSON.stringify(input);
    const timeline = buildLessonTimeline(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(input[0]).toBe(later);
    expect(timeline[0]).toMatchObject({ kind: "lesson", lesson: earlier });
  });

  it("does not add leading or trailing breaks to an empty or single lesson day", () => {
    expect(buildLessonTimeline([])).toEqual([]);
    expect(buildLessonTimeline([dailyLessons[3]])).toEqual([
      { kind: "lesson", ...keyedLessons([dailyLessons[3]])[0] },
    ]);
  });
});
