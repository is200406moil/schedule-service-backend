// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../shared/types";
import { TaskDeleteDialog } from "./TaskDeleteDialog";
import { deferred, installDialogTestDouble, mountDialog, requestDialogCancel } from "../../test/dialogTestUtils";

const firstTask: Task = {
  id: 1,
  title: "Первая задача",
  body: null,
  subject: null,
  status: "todo",
  due_at: null,
  created_at: "2026-10-02T10:00:00Z",
  updated_at: "2026-10-02T10:00:00Z",
};
const secondTask: Task = { ...firstTask, id: 2, title: "Вторая задача" };

describe("task deletion interactions", () => {
  let dialogs: ReturnType<typeof installDialogTestDouble>;
  let mounted: Awaited<ReturnType<typeof mountDialog>> | undefined;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    dialogs = installDialogTestDouble();
  });

  afterEach(async () => {
    await mounted?.unmount();
    mounted = undefined;
    dialogs.restore();
    vi.unstubAllGlobals();
  });

  function dialog() { return mounted!.container.querySelector<HTMLDialogElement>("dialog")!; }
  function confirm() { return mounted!.container.querySelector<HTMLButtonElement>(".tasks-delete-confirm")!; }

  it("blocks native Escape cancellation and duplicate clicks while deletion is pending", async () => {
    const pending = deferred();
    const onClose = vi.fn();
    const onDelete = vi.fn(() => pending.promise);
    mounted = await mountDialog(<TaskDeleteDialog task={firstTask} onClose={onClose} onDelete={onDelete} />);
    let cancellation: Event | undefined;

    await act(async () => {
      // Both clicks precede React's pending-state render, exercising the ref guard.
      confirm().click();
      confirm().click();
      cancellation = requestDialogCancel(dialog());
    });

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(firstTask.id);
    expect(cancellation?.defaultPrevented).toBe(true);
    expect(dialog().open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(confirm().disabled).toBe(true);
    expect(confirm().textContent).toBe("Удаляем…");
    expect(mounted.container.querySelector<HTMLButtonElement>(".tasks-delete-cancel")!.disabled).toBe(true);

    await act(async () => { pending.resolve(); });
    expect(dialog().open).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open after failure and permits a clean retry", async () => {
    const failed = deferred();
    const retry = deferred();
    const onClose = vi.fn();
    const onDelete = vi.fn().mockImplementationOnce(() => failed.promise).mockImplementationOnce(() => retry.promise);
    mounted = await mountDialog(<TaskDeleteDialog task={firstTask} onClose={onClose} onDelete={onDelete} />);

    await act(async () => { confirm().click(); });
    await act(async () => { failed.reject(new Error("delete failed")); });

    expect(dialog().open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(confirm().disabled).toBe(false);
    expect(mounted.container.querySelector('[role="alert"]')?.textContent).toContain("Попробуйте ещё раз");

    await act(async () => { confirm().click(); });
    expect(onDelete).toHaveBeenCalledTimes(2);
    expect(mounted.container.querySelector('[role="alert"]')).toBeNull();

    await act(async () => { retry.resolve(); });
    expect(dialog().open).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("blocks a Cancel click before the pending render commits and restores Cancel after failure", async () => {
    const pending = deferred();
    const onClose = vi.fn();
    const onDelete = vi.fn(() => pending.promise);
    mounted = await mountDialog(<TaskDeleteDialog task={firstTask} onClose={onClose} onDelete={onDelete} />);
    const cancel = mounted.container.querySelector<HTMLButtonElement>(".tasks-delete-cancel")!;

    await act(async () => {
      confirm().click();
      // Disabled has not committed yet, so the handler must guard this click.
      expect(cancel.disabled).toBe(false);
      cancel.click();
    });

    expect(dialog().open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(firstTask.id);

    await act(async () => { pending.reject(new Error("delete failed")); });
    expect(cancel.disabled).toBe(false);
    await act(async () => { cancel.click(); });
    expect(dialog().open).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each(["success", "failure"] as const)("ignores stale %s after switching tasks, including during the new deletion", async (outcome) => {
    const first = deferred();
    const second = deferred();
    const onClose = vi.fn();
    const onDelete = vi.fn((id: number) => id === firstTask.id ? first.promise : second.promise);
    mounted = await mountDialog(<TaskDeleteDialog task={firstTask} onClose={onClose} onDelete={onDelete} />);
    const firstDialog = dialog();
    await act(async () => { confirm().click(); });

    await mounted.render(<TaskDeleteDialog task={secondTask} onClose={onClose} onDelete={onDelete} />);
    const secondDialog = dialog();
    expect(firstDialog.open).toBe(false);
    expect(secondDialog).not.toBe(firstDialog);
    expect(secondDialog.textContent).toContain(secondTask.title);
    expect(confirm().disabled).toBe(false);
    await act(async () => { confirm().click(); });

    await act(async () => {
      if (outcome === "success") first.resolve();
      else first.reject(new Error("stale delete failed"));
    });

    expect(secondDialog.open).toBe(true);
    expect(confirm().disabled).toBe(true);
    expect(mounted.container.querySelector('[role="alert"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    let cancellation: Event | undefined;
    await act(async () => { cancellation = requestDialogCancel(secondDialog); });
    expect(cancellation?.defaultPrevented).toBe(true);
    expect(onDelete.mock.calls).toEqual([[firstTask.id], [secondTask.id]]);

    await act(async () => { second.resolve(); });
    expect(secondDialog.open).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("resets a failed task's error when its dialog is closed and reopened", async () => {
    const failed = deferred();
    const onClose = vi.fn();
    const onDelete = vi.fn(() => failed.promise);
    mounted = await mountDialog(<TaskDeleteDialog task={firstTask} onClose={onClose} onDelete={onDelete} />);
    await act(async () => { confirm().click(); });
    await act(async () => { failed.reject(new Error("delete failed")); });
    expect(mounted.container.querySelector('[role="alert"]')).not.toBeNull();
    let cancellation: Event | undefined;
    await act(async () => { cancellation = requestDialogCancel(dialog()); });
    expect(cancellation?.defaultPrevented).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();

    await mounted.render(<TaskDeleteDialog task={null} onClose={onClose} onDelete={onDelete} />);
    await mounted.render(<TaskDeleteDialog task={firstTask} onClose={onClose} onDelete={onDelete} />);
    expect(dialog().open).toBe(true);
    expect(confirm().disabled).toBe(false);
    expect(mounted.container.querySelector('[role="alert"]')).toBeNull();
  });

  it.each(["success", "failure"] as const)("ignores late %s after unmount", async (outcome) => {
    const pending = deferred();
    const onClose = vi.fn();
    const onDelete = vi.fn(() => pending.promise);
    mounted = await mountDialog(<TaskDeleteDialog task={firstTask} onClose={onClose} onDelete={onDelete} />);
    const removedDialog = dialog();
    await act(async () => { confirm().click(); });
    await mounted.unmount();
    expect(removedDialog.open).toBe(false);
    dialogs.close.mockClear();

    await act(async () => {
      if (outcome === "success") pending.resolve();
      else pending.reject(new Error("late delete failed"));
    });

    expect(dialogs.close).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(mounted.container.childElementCount).toBe(0);
  });

  it("keeps the dialog usable after Strict Mode effect cleanup", async () => {
    const pending = deferred();
    const onClose = vi.fn();
    const onDelete = vi.fn(() => pending.promise);
    mounted = await mountDialog(<StrictMode><TaskDeleteDialog task={firstTask} onClose={onClose} onDelete={onDelete} /></StrictMode>);

    expect(dialog().open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { confirm().click(); pending.resolve(); });
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(firstTask.id);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
