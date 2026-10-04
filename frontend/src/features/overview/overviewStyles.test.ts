import { readFileSync } from "node:fs";
import { parse, type Container } from "postcss";
import { describe, expect, it } from "vitest";

const stylesheet = parse(readFileSync(new URL("./overview.css", import.meta.url), "utf8"));

// This checks source order for normal declarations of exact selectors and the
// overview's max-width media queries. It does not simulate browser layout,
// selector specificity, inherited values, or the rest of the CSS cascade.
function declarations(selector: string, width: number): Record<string, string> {
  const result: Record<string, string> = {};
  function visit(container: Container) {
    container.each((node) => {
      if (node.type === "atrule" && node.name === "media") {
        const maxWidth = /^\(max-width:\s*(\d+)px\)$/.exec(node.params);
        if (!maxWidth) throw new Error(`Unsupported overview media condition: ${node.params}`);
        if (width <= Number(maxWidth[1])) visit(node);
      } else if (node.type === "rule" && node.selectors.includes(selector)) {
        node.each((declaration) => {
          if (declaration.type !== "decl") return;
          if (declaration.important) throw new Error("This check only supports normal declarations.");
          result[declaration.prop] = declaration.value;
        });
      }
    });
  }
  visit(stylesheet);
  return result;
}

describe("overview responsive stylesheet cascade", () => {
  it.each([320, 375, 740])("keeps panels stacked and days horizontally scrollable at %ipx", (width) => {
    expect(declarations(".content-grid", width)["grid-template-columns"]).toBe("minmax(0, 1fr)");
    expect(declarations(".hero", width)["grid-template-columns"]).toBe("minmax(0, 1fr)");
    expect(declarations(".hero-aside", width)).toMatchObject({
      "min-width": "0", "grid-template-columns": "repeat(2, minmax(0, 1fr))",
    });
    expect(declarations(".week-days", width)).toMatchObject({
      display: "flex", "overflow-x": "auto", "scroll-snap-type": "x proximity",
    });
    expect(declarations(".day-tile", width)).toMatchObject({
      width: "72px", "min-width": "72px", "min-height": "103px",
    });
    expect(declarations(".agenda-panel", width)).toMatchObject({ padding: "22px 20px", "min-height": "0" });
    expect(declarations(".tasks-panel", width)).toMatchObject({ padding: "22px 20px", "min-height": "0" });
    expect(declarations(".week-heading", width)).toMatchObject({ "flex-wrap": "wrap", "align-items": "start" });
    expect(declarations(".week-controls", width)["margin-left"]).toBe("auto");
    expect(declarations(".panel-link", width)).toMatchObject({ "min-width": "44px", "min-height": "44px" });
  });

  it.each([741, 980])("retains the intermediate two-column panels and seven-day grid at %ipx", (width) => {
    expect(declarations(".content-grid", width)["grid-template-columns"]).toBe("minmax(0, 1fr) minmax(290px, .85fr)");
    expect(declarations(".week-days", width)).toMatchObject({ display: "grid", "grid-template-columns": "repeat(7, minmax(0, 1fr))" });
    expect(declarations(".day-tile", width)).toMatchObject({ "min-width": "0", "min-height": "111px" });
    expect(declarations(".week-controls button", width)).toMatchObject({ "min-width": "44px", height: "44px", padding: "0 12px" });
  });

  it("preserves the desktop panel, day-card and navigation-button sizes at 1280px", () => {
    expect(declarations(".content-grid", 1280)["grid-template-columns"]).toBe("minmax(0, 1.15fr) minmax(315px, .85fr)");
    expect(declarations(".week-days", 1280)).toMatchObject({ display: "grid", "grid-template-columns": "repeat(7, minmax(0, 1fr))" });
    expect(declarations(".day-tile", 1280)).toMatchObject({ "min-width": "0", "min-height": "111px" });
    expect(declarations(".agenda-panel", 1280)).toMatchObject({ padding: "26px", "min-height": "370px" });
    expect(declarations(".week-controls button", 1280)).toMatchObject({ "min-width": "44px", height: "44px", padding: "0 12px" });
  });

  it.each([320, 375])("keeps week-navigation touch targets usable at %ipx", (width) => {
    expect(declarations(".week-controls button", width)).toMatchObject({ "min-width": "44px", height: "44px" });
    expect(declarations(".week-controls", width).gap).toBe("8px");
  });
});
