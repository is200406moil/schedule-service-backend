import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TaskCreateDialog } from "./TaskCreateDialog";

describe("task creation sheet", () => {
  const html = renderToStaticMarkup(<TaskCreateDialog open group="ИКБО-14-23" subjects={[]} onClose={() => {}} onCreate={async () => {}} />);

  it("keeps button and keyboard alternatives to swipe dismissal", () => {
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-labelledby="task-create-heading"');
    expect(html).toContain('aria-label="Закрыть форму"');
    expect(html).toContain('>Отмена</button>');
    expect(html).toContain('>Создать задачу</button>');
  });

  it("separates the gesture header from the scrolling form content", () => {
    expect(html).toContain('class="task-create-top"');
    expect(html).toContain('class="task-create-handle" aria-hidden="true"');
    expect(html).toContain('class="task-create-body"');
    expect(html.indexOf('class="task-create-top"')).toBeLessThan(html.indexOf('<form'));
  });
});
