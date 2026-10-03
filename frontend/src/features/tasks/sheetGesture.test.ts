import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sheetDragDistance, shouldDismissSheet, SHEET_DISMISS_DISTANCE, SHEET_MEDIA_QUERY } from "./sheetGesture";

describe("mobile sheet media query", () => {
  // Evaluate this max-width/max-height-only query without a DOM dependency.
  function matchesViewport(width: number, height: number) {
    return SHEET_MEDIA_QUERY.split(",").some((clause) => {
      const limits = [...clause.matchAll(/\(max-(width|height): (\d+)px\)/g)];
      return limits.length > 0 && limits.every(([, axis, limit]) => (axis === "width" ? width : height) <= Number(limit));
    });
  }

  it.each([
    [375, 812, true],
    [760, 900, true],
    [761, 501, false],
    [812, 375, true],
    [999, 500, true],
    [1000, 500, true],
    [1001, 500, false],
    [999, 501, false],
    [1440, 900, false],
  ])("matches %ix%i as sheet: %s", (width, height, expected) => {
    expect(matchesViewport(width, height)).toBe(expected);
  });

  it("keeps gesture behavior and sheet layout on the same breakpoints", () => {
    const css = readFileSync(new URL("./task-create-dialog.css", import.meta.url), "utf8");
    expect(css).toContain(`@media ${SHEET_MEDIA_QUERY} {`);
  });
});

describe("mobile sheet gesture", () => {
  const start = { x: 150, y: 100 };

  it("does not start dragging on a tap or a small movement", () => {
    expect(sheetDragDistance(start, start)).toBe(0);
    expect(sheetDragDistance(start, { x: 151, y: 107 })).toBe(0);
  });

  it("tracks downward movement without moving the sheet upwards", () => {
    expect(sheetDragDistance(start, { x: 150, y: 124 })).toBe(24);
    expect(sheetDragDistance(start, { x: 150, y: 20 })).toBe(0);
  });

  it("requires a deliberate downward swipe to dismiss", () => {
    expect(shouldDismissSheet(start, { x: 155, y: 100 + SHEET_DISMISS_DISTANCE - 1 })).toBe(false);
    expect(shouldDismissSheet(start, { x: 155, y: 100 + SHEET_DISMISS_DISTANCE })).toBe(true);
  });

  it("does not dismiss on sideways or diagonal gestures", () => {
    expect(shouldDismissSheet(start, { x: 270, y: 100 })).toBe(false);
    expect(shouldDismissSheet(start, { x: 270, y: 200 })).toBe(false);
  });
});
