import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Lesson, Loadable, Schedule } from "../../shared/types";
import { CalendarDayLessons } from "./CalendarDayLessons";

function lesson(name: string, start: string, end: string): Lesson {
  return { name, time_start: start, time_end: end, weeks: [1, 2], types: "Лекция", teachers: ["Иванов"], rooms: ["А-101"] };
}

const lessons = [
  lesson("Математика", "09:00", "10:30"),
  lesson("Физика", "10:40", "12:10"),
  lesson("История", "12:40", "14:10"),
  lesson("Информатика", "14:20", "15:50"),
];

function ready(rows: Lesson[]): Loadable<Schedule> {
  return { kind: "ready", data: { group: "ИКБО-14-23", schedule: { "5": { lessons: rows.map((row) => [row]) } } } };
}

function render(schedule: Loadable<Schedule>, group = "ИКБО-14-23") {
  return renderToStaticMarkup(<CalendarDayLessons date="2026-10-02" group={group} schedule={schedule}
    highlightLesson="10:40" onRetry={() => {}} onAddForLesson={() => {}} />);
}

describe("calendar lesson breaks", () => {
  it("adds only the actual breaks while retaining existing lesson cards and actions", () => {
    const html = render(ready(lessons));
    expect(html.match(/class="calendar-break"/g)).toHaveLength(3);
    expect(html.match(/<strong>10 мин<\/strong>/g)).toHaveLength(2);
    expect(html).toContain("<strong>30 мин</strong>");
    expect(html).toContain("4 пары");
    expect(html).toContain('class="calendar-lesson is-highlighted"');
    expect(html.match(/Задача к паре/g)).toHaveLength(4);
    expect(html).toContain("Лекция · Иванов");
    expect(html).toContain("А-101");
  });

  it("shows a complete gap when a slot is absent", () => {
    expect(render(ready([lessons[0], lessons[2]]))).toContain("<strong>2 ч 10 мин</strong>");
  });

  it("keeps parallel cards in their original order without inserting a false break", () => {
    const html = render(ready([lesson("Подгруппа", "09:00", "10:20"), lessons[0], lessons[1]]));
    expect(html.indexOf("Подгруппа")).toBeLessThan(html.indexOf("Математика"));
    expect(html.match(/class="calendar-break"/g)).toHaveLength(1);
    expect(html).toContain("<strong>10 мин</strong>");
    expect(html).toContain("3 пары");
  });

  it.each([ready([]), { kind: "loading" } as const, { kind: "error" } as const])(
    "does not insert breaks for empty, loading or unavailable schedules: %j",
    (schedule) => {
      expect(render(schedule)).not.toContain('class="calendar-break"');
    },
  );

  it("retains the missing-group state without rendering breaks", () => {
    const html = render(ready(lessons), "");
    expect(html).toContain("Укажите группу в профиле");
    expect(html).not.toContain('class="calendar-break"');
  });
});
