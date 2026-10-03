// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskCreateDialog } from "./TaskCreateDialog";
import { installDialogTestDouble, mountDialog } from "../../test/dialogTestUtils";

describe("task creation dialog cleanup", () => {
  let dialogs: ReturnType<typeof installDialogTestDouble>;
  let mounted: Awaited<ReturnType<typeof mountDialog>> | undefined;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    dialogs = installDialogTestDouble();
  });

  afterEach(async () => {
    await mounted?.unmount();
    mounted = undefined;
    dialogs.restore();
    vi.unstubAllGlobals();
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  });

  it("closes the captured node and restores scrolling when React clears its ref on unmount", async () => {
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "scroll";
    mounted = await mountDialog(<TaskCreateDialog open group="ИКБО-14-23" subjects={[]} onClose={() => {}} onCreate={async () => {}} />);
    const dialog = mounted.container.querySelector<HTMLDialogElement>("dialog")!;
    expect(dialog.open).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    await mounted.unmount();

    expect(dialog.open).toBe(false);
    expect(document.documentElement.style.overflow).toBe("auto");
    expect(document.body.style.overflow).toBe("scroll");
  });
});
