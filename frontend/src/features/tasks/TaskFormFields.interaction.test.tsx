// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskFormFields } from "./TaskFormFields";
import { blankTaskFields } from "./taskEditorModel";

describe("task field label associations", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("gives every control a native label with either instance prefix", async () => {
    await act(async () => {
      root.render(<>{["task-create", "task-editor"].map((prefix) => (
        <TaskFormFields key={prefix} fields={blankTaskFields()} onChange={() => {}} disabled={false} subjects={[]} titleError="" dueError="" titleRef={createRef()} dueRef={createRef()} idPrefix={prefix} />
      ))}</>);
    });
    const controls = container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    expect(controls).toHaveLength(8);
    for (const control of controls) {
      expect(control.labels).toHaveLength(1);
      expect(control.labels![0].htmlFor).toBe(control.id);
      expect(control.labels![0].textContent!.trim()).not.toBe("");
    }
    for (const due of container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')) {
      const label = document.getElementById(due.getAttribute("aria-labelledby")!);
      expect(label).toBe(due.labels![0]);
      expect(label!.textContent).toContain("Срок");
    }
  });
});
