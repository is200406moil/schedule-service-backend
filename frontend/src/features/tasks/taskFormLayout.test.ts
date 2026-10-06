import { readFileSync } from "node:fs";
import { parse, type Root } from "postcss";
import { describe, expect, it } from "vitest";

const fields = parse(readFileSync(new URL("../../shared/form-fields.css", import.meta.url), "utf8"));
const sheet = parse(readFileSync(new URL("./task-create-dialog.css", import.meta.url), "utf8"));

// Source-level guards for intrinsic sizing and scroll direction, not a browser layout simulation.
function declarations(stylesheet: Root, selector: string, mobile = false) {
  const result: Record<string, string> = {};
  stylesheet.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    const parent = rule.parent;
    if (parent?.type === "atrule" && !(mobile && parent.name === "media" && parent.params.includes("max-width: 760px"))) return;
    rule.walkDecls((declaration) => { result[declaration.prop] = declaration.value; });
  });
  return result;
}

describe("task form width containment", () => {
  it.each([".form-field input", ".form-field textarea"])("bounds %s independently of its native content width", (selector) => {
    expect(declarations(fields, selector)).toMatchObject({
      "box-sizing": "border-box", width: "100%", "min-width": "0", "max-width": "100%",
    });
  });

  it.each(['.form-field input[type="date"]', '.form-field input[type="datetime-local"]'])("normalizes native sizing for %s", (selector) => {
    expect(declarations(fields, selector)).toMatchObject({ display: "block", appearance: "none" });
    expect(declarations(fields, ".form-field input::-webkit-date-and-time-value")).toMatchObject({ "min-width": "0", "text-align": "left" });
  });

  it.each([".task-create-dialog form", ".task-create-body"])("allows the %s grid track to shrink below min-content", (selector) => {
    expect(declarations(sheet, selector)).toMatchObject({ "min-width": "0", "max-width": "100%", "grid-template-columns": "minmax(0, 1fr)" });
  });

  it("keeps the mobile sheet vertically scrollable without horizontal panning", () => {
    expect(declarations(sheet, ".task-create-body", true)).toMatchObject({ "overflow-x": "hidden", "overflow-y": "auto", "overflow-wrap": "anywhere" });
    expect(declarations(sheet, ".task-create-dialog .form-fields-row", true)).toMatchObject({ "min-width": "0", "grid-template-columns": "minmax(0, 1fr)" });
    expect(declarations(sheet, ".task-create-actions", true)["flex"]).toBe("0 0 auto");
  });
});
