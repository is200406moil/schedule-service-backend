import type { Lesson } from "./types";

export function keyedLessons(lessons: readonly Lesson[]): { key: string; lesson: Lesson }[] {
  const occurrences = new Map<string, number>();
  return lessons.map((lesson) => {
    const identity = JSON.stringify([
      lesson.name,
      lesson.time_start,
      lesson.time_end,
      lesson.types,
      [...lesson.weeks].sort((left, right) => left - right),
      lesson.teachers,
      lesson.rooms,
    ]);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    // The API has no lesson ID. Match content across refetches and reordering;
    // an occurrence suffix keeps indistinguishable duplicates uniquely keyed.
    return { key: `${identity}:${occurrence}`, lesson };
  });
}
