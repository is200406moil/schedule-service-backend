import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TaskFormFields } from "./TaskFormFields";
import { blankTaskFields } from "./taskEditorModel";

function renderFields(disabled = false, titleError = "") {
  return renderToStaticMarkup(<TaskFormFields fields={blankTaskFields("", "2026-10-02T18:00")} onChange={() => {}} disabled={disabled} subjects={["Базы данных"]} titleError={titleError} dueError="" titleRef={createRef()} dueRef={createRef()} idPrefix="task-create" />);
}

describe("shared task form", () => {
  it("requires only the title and keeps the calendar deadline editable", () => {
    const html = renderFields();
    expect(html.match(/required=""/g)).toHaveLength(1);
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain('value="2026-10-02T18:00"');
    expect(html).toContain('list="task-create-subject-options"');
    expect(html).toContain('value="Базы данных"');
  });

  it("disables every editable field during save", () => {
    expect(renderFields(true).match(/disabled=""/g)).toHaveLength(4);
  });

  it("connects validation feedback with the invalid title field", () => {
    const html = renderFields(false, "Напишите название задачи.");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="task-create-title-hint task-create-title-error"');
    expect(html).toContain('id="task-create-title-error"');
  });
});
