import { keyedLessons } from "./lessonIdentity";
import type { Lesson } from "./types";

export type LessonTimelineEntry =
  | { kind: "lesson"; lesson: Lesson; key: string }
  | { kind: "break"; key: string; minutes: number; label: string };

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function timeInSeconds(value: string): number | null {
  if (typeof value !== "string") return null;
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
}

function breakLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${minutes} мин`;
  return remainder === 0 ? `${hours} ч` : `${hours} ч ${remainder} мин`;
}

export function buildLessonTimeline(lessons: readonly Lesson[]): LessonTimelineEntry[] {
  const timedLessons = keyedLessons(lessons).map((entry) => ({
    ...entry,
    start: timeInSeconds(entry.lesson.time_start),
    end: timeInSeconds(entry.lesson.time_end),
  }));
  // Match the calendar's existing order, including stable parallel lesson rows.
  timedLessons.sort((left, right) => left.lesson.time_start.localeCompare(right.lesson.time_start));

  const timeline: LessonTimelineEntry[] = [];
  let frontier: number | null = null;
  // Without a start, a row may occupy any apparent gap in the day.
  let gapsKnown = timedLessons.every((entry) => entry.start !== null);
  for (const { lesson, key, start, end } of timedLessons) {
    if (gapsKnown && frontier !== null && start !== null) {
      const minutes = Math.floor((start - frontier) / 60);
      if (minutes > 0) {
        timeline.push({
          kind: "break",
          key: `break:${frontier}:${start}`,
          minutes,
          label: breakLabel(minutes),
        });
      }
    }
    timeline.push({ kind: "lesson", lesson, key });
    if (start === null || end === null || end <= start) {
      // An unknown end makes every later gap uncertain; retain the lesson itself.
      gapsKnown = false;
    } else if (frontier === null || end > frontier) {
      frontier = end;
    }
  }
  return timeline;
}
