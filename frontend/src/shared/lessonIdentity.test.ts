import { describe, expect, it } from "vitest";
import { keyedLessons } from "./lessonIdentity";
import type { Lesson } from "./types";

const lesson: Lesson = {
  name: "Математика",
  time_start: "09:00",
  time_end: "10:30",
  types: "Лекция",
  weeks: [1, 2],
  teachers: ["Иванов"],
  rooms: ["А-101"],
};

describe("lesson identity", () => {
  it("keeps keys stable when distinct lessons are reordered or inserted", () => {
    const other = { ...lesson, rooms: ["А-102"] };
    const third = { ...lesson, name: "Физика" };
    const initial = keyedLessons([lesson, other]);
    const reordered = keyedLessons([third, other, lesson]);
    expect(reordered[1].key).toBe(initial[1].key);
    expect(reordered[2].key).toBe(initial[0].key);
    expect(reordered[2].lesson).toBe(lesson);
  });

  it("uses deterministic content identity across fresh API objects", () => {
    const clone = {
      rooms: [...lesson.rooms], teachers: [...lesson.teachers], weeks: [2, 1],
      types: lesson.types, time_end: lesson.time_end, time_start: lesson.time_start, name: lesson.name,
    };
    expect(keyedLessons([clone])[0].key).toBe(keyedLessons([lesson])[0].key);
    expect(clone.weeks).toEqual([2, 1]);
    expect(lesson.weeks).toEqual([1, 2]);
  });

  it("distinguishes lessons sharing their name and start time", () => {
    const variants = [
      lesson,
      { ...lesson, time_end: "11:00" },
      { ...lesson, types: "Практика" },
      { ...lesson, weeks: [1] },
      { ...lesson, teachers: ["Петров"] },
      { ...lesson, rooms: ["А-102"] },
    ];
    expect(new Set(keyedLessons(variants).map((entry) => entry.key)).size).toBe(variants.length);
  });

  it("keeps identical duplicate rows unique and their key set stable across reorder", () => {
    const duplicate = { ...lesson, rooms: [...lesson.rooms] };
    const other = { ...lesson, name: "Физика" };
    const initialKeys = keyedLessons([lesson, other, duplicate]).map((entry) => entry.key);
    const reorderedKeys = keyedLessons([duplicate, lesson, other]).map((entry) => entry.key);
    expect(new Set(initialKeys).size).toBe(3);
    expect([...reorderedKeys].sort()).toEqual([...initialKeys].sort());
    expect(reorderedKeys[2]).toBe(initialKeys[1]);
    expect(keyedLessons([other, lesson])[1].key).toBe(initialKeys[0]);
  });
});
