import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { vi } from "vitest";

export function installDialogTestDouble() {
  const prototype = HTMLDialogElement.prototype;
  const originalShowModal = Object.getOwnPropertyDescriptor(prototype, "showModal");
  const originalClose = Object.getOwnPropertyDescriptor(prototype, "close");
  const showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
  const close = vi.fn(function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    queueMicrotask(() => { this.dispatchEvent(new Event("close")); });
  });
  Object.defineProperties(prototype, {
    showModal: { configurable: true, writable: true, value: showModal },
    close: { configurable: true, writable: true, value: close },
  });
  return {
    showModal,
    close,
    restore() {
      if (originalShowModal) Object.defineProperty(prototype, "showModal", originalShowModal);
      else Reflect.deleteProperty(prototype, "showModal");
      if (originalClose) Object.defineProperty(prototype, "close", originalClose);
      else Reflect.deleteProperty(prototype, "close");
    },
  };
}

export async function mountDialog(element: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let mounted = true;
  await act(async () => { root.render(element); });
  return {
    container,
    async render(next: ReactNode) { await act(async () => { root.render(next); }); },
    async unmount() {
      if (!mounted) return;
      mounted = false;
      await act(async () => { root.unmount(); });
      container.remove();
    },
  };
}

export function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

// jsdom has no native Escape default action: dispatch its cancel event and apply
// the close only when the component lets that default action proceed.
export function requestDialogCancel(dialog: HTMLDialogElement) {
  const event = new Event("cancel", { cancelable: true });
  if (dialog.dispatchEvent(event)) dialog.close();
  return event;
}
