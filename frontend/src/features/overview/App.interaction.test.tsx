// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { installDialogTestDouble } from "../../test/dialogTestUtils";
import type { BootData } from "../../shared/types";

vi.mock("../../shared/api", async (importOriginal) => {
  const api = await importOriginal<typeof import("../../shared/api")>();
  return { ...api, getTasks: vi.fn().mockResolvedValue([]) };
});

const boot: BootData = {
  firstName: "Анна", group: "", avatar: "", today: "2026-10-02", csrfToken: "test",
};

describe("overview date selection", () => {
  let container: HTMLDivElement;
  let root: Root;
  let dialogs: ReturnType<typeof installDialogTestDouble>;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    dialogs = installDialogTestDouble();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    dialogs.restore();
    vi.unstubAllGlobals();
  });

  it("starts with today's date but keeps the user's selection on rerender", async () => {
    await act(async () => root.render(<App boot={boot} />));
    expect(container.querySelector('.day-tile[aria-pressed="true"]')!.getAttribute("aria-label")).toContain("2 октября");
    const monday = container.querySelector<HTMLButtonElement>(".day-tile")!;
    const mondayLabel = monday.getAttribute("aria-label");
    await act(async () => monday.click());
    await act(async () => root.render(<App boot={{ ...boot, firstName: "Анна Сергеевна" }} />));
    expect(container.querySelector('.day-tile[aria-pressed="true"]')!.getAttribute("aria-label")).toBe(mondayLabel);
    const today = Array.from(container.querySelectorAll<HTMLButtonElement>(".week-controls button")).find((button) => button.textContent === "Сегодня")!;
    await act(async () => today.click());
    expect(container.querySelector('.day-tile[aria-pressed="true"]')!.getAttribute("aria-label")).toContain("2 октября");
  });
});
