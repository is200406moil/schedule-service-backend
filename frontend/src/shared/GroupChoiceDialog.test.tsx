// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getGroups, UnauthorizedError, updateProfile } from "./api";
import { GroupChoiceDialog } from "./GroupChoiceDialog";
import { Shell } from "./Shell";
import { deferred, installDialogTestDouble, mountDialog, requestDialogCancel } from "../test/dialogTestUtils";
import type { BootData, UserProfile } from "./types";

vi.mock("./api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./api")>(),
  getGroups: vi.fn(),
  updateProfile: vi.fn(),
}));

const boot: BootData = { firstName: "", group: "", avatar: "", today: "2026-10-06", csrfToken: "test-csrf" };
const profile: UserProfile = { id: 1, email: "test@example.com", is_active: true, first_name: null, last_name: null, patronymic: null, birth_date: null, group_name: "ИКБО-14-23", avatar_base64: null };

describe("group choice after login", () => {
  let dialogs: ReturnType<typeof installDialogTestDouble>;
  let mounted: Awaited<ReturnType<typeof mountDialog>> | undefined;
  const onLater = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.resetAllMocks();
    vi.mocked(getGroups).mockResolvedValue({ count: 2, groups: ["ИКБО-14-23", "ИНБО-01-24"] });
    vi.mocked(updateProfile).mockResolvedValue(profile);
    dialogs = installDialogTestDouble();
    window.history.replaceState(null, "", "/ui");
  });

  afterEach(async () => {
    await mounted?.unmount();
    mounted = undefined;
    dialogs.restore();
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
  });

  async function mount() {
    mounted = await mountDialog(<StrictMode><GroupChoiceDialog csrfToken={boot.csrfToken} onLater={onLater} onSaved={onSaved} /></StrictMode>);
  }

  function dialog() { return mounted!.container.querySelector<HTMLDialogElement>("dialog")!; }
  function button(selector: string) { return mounted!.container.querySelector<HTMLButtonElement>(selector)!; }
  async function enter(value: string) {
    const input = mounted!.container.querySelector<HTMLInputElement>("#group-choice-input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  async function submit() {
    await act(async () => { mounted!.container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  }

  it("opens and focuses a labelled field with group suggestions", async () => {
    await mount();
    expect(dialog().open).toBe(true);
    expect(document.activeElement?.id).toBe("group-choice-input");
    expect(mounted!.container.querySelectorAll("datalist option")).toHaveLength(2);
    await enter("инбо");
    expect(mounted!.container.querySelectorAll("datalist option")).toHaveLength(1);
  });

  it("saves only the group with CSRF protection", async () => {
    await mount();
    await enter(" ИКБО-14-23 ");
    await submit();
    expect(updateProfile).toHaveBeenCalledExactlyOnceWith({ group_name: "ИКБО-14-23" }, "test-csrf");
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onLater).not.toHaveBeenCalled();
  });

  it("rejects an empty group and keeps focus on the field", async () => {
    await mount();
    await enter("   ");
    await submit();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(mounted!.container.querySelector('[role="alert"]')?.textContent).toContain("Введите или выберите");
    expect(document.activeElement?.id).toBe("group-choice-input");
  });

  it.each(["later", "escape"])("allows postponing with %s without changing the profile", async (method) => {
    await mount();
    await act(async () => { if (method === "later") button(".group-choice-later").click(); else requestDialogCancel(dialog()); });
    expect(onLater).toHaveBeenCalledOnce();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("allows manual entry when suggestions fail and can retry loading", async () => {
    vi.mocked(getGroups).mockRejectedValue(new Error("offline"));
    await mount();
    expect(mounted!.container.textContent).toContain("Группу можно ввести вручную");
    vi.mocked(getGroups).mockResolvedValue({ count: 1, groups: ["ИКБО-14-23"] });
    await act(async () => button(".group-choice-retry").click());
    expect(mounted!.container.querySelectorAll("datalist option")).toHaveLength(1);
    await enter("ИКБО-14-23");
    await submit();
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("blocks duplicate submission and Escape while saving", async () => {
    const pending = deferred();
    vi.mocked(updateProfile).mockImplementation(async () => { await pending.promise; return profile; });
    await mount();
    await enter("ИКБО-14-23");
    await act(async () => {
      const form = mounted!.container.querySelector("form")!;
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      requestDialogCancel(dialog());
    });
    expect(updateProfile).toHaveBeenCalledOnce();
    expect(dialog().open).toBe(true);
    expect(button(".group-choice-later").disabled).toBe(true);
    await act(async () => pending.resolve());
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it.each([new Error("offline"), new ApiError(403), new ApiError(422), new UnauthorizedError()])("keeps errors visible and does not report a successful save (%s)", async (failure) => {
    vi.mocked(updateProfile).mockRejectedValue(failure);
    await mount();
    await enter("ИКБО-14-23");
    await submit();
    expect(dialog().open).toBe(true);
    expect(mounted!.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("ignores a save that completes after unmount", async () => {
    const pending = deferred();
    vi.mocked(updateProfile).mockImplementation(async () => { await pending.promise; return profile; });
    await mount();
    await enter("ИКБО-14-23");
    await submit();
    await mounted!.unmount();
    await act(async () => pending.resolve());
    expect(onSaved).not.toHaveBeenCalled();
    expect(onLater).not.toHaveBeenCalled();
  });

  it("clears the login prompt on postponement and does not reopen it on navigation", async () => {
    window.history.replaceState(null, "", "/ui?choose_group=1&date=2026-10-06");
    mounted = await mountDialog(<Shell user={boot}>Обзор</Shell>);
    await act(async () => button(".group-choice-later").click());
    expect(mounted.container.querySelector("dialog")).toBeNull();
    expect(window.location.search).toBe("?date=2026-10-06");
    expect(document.activeElement?.id).toBe("main");
    await mounted.render(<Shell user={boot} section="calendar">Календарь</Shell>);
    expect(mounted.container.querySelector("dialog")).toBeNull();
  });

  it("does not prompt without a login marker or with an existing group", async () => {
    mounted = await mountDialog(<Shell user={boot}>Обзор</Shell>);
    expect(mounted.container.querySelector("dialog")).toBeNull();
    await mounted.unmount();
    window.history.replaceState(null, "", "/ui?choose_group=1");
    mounted = await mountDialog(<Shell user={{ ...boot, group: "ИКБО-14-23" }}>Обзор</Shell>);
    expect(mounted.container.querySelector("dialog")).toBeNull();
  });
});
