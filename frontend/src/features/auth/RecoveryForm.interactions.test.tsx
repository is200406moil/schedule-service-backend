// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicApp } from "./PublicApp";
import { RecoveryPage } from "./RecoveryPage";
import type { RecoveryBoot } from "./types";

const token = "a".repeat(43);
const boot: RecoveryBoot = { page: "password-reset", csrfToken: "test-csrf", email: "", error: null, ok: null, mailMode: "smtp" };
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState({}, "", `/ui/password-reset#token=${token}`);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

function fillPassword(password: string, confirmation = password) {
  host.querySelector<HTMLInputElement>("#password-reset-password")!.value = password;
  host.querySelector<HTMLInputElement>("#password-reset-password-confirm")!.value = confirmation;
}

async function submitForm() {
  const event = new Event("submit", { bubbles: true, cancelable: true });
  await act(() => { host.querySelector("form")!.dispatchEvent(event); });
  return event;
}

describe("password recovery interactions", () => {
  it("uses the current fragment only in a native POST and preserves it through page restoration", async () => {
    await act(() => root.render(<RecoveryPage boot={boot} />));
    fillPassword("valid-password");
    const form = host.querySelector("form")!;
    const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const event = await submitForm();
    expect(event.defaultPrevented).toBe(false);
    expect(form.method).toBe("post");
    expect(form.getAttribute("action")).toBe(`/ui/password-reset#token=${token}`);
    expect(new FormData(form).get("token")).toBe(token);
    expect(new FormData(form).get("csrf_token")).toBe("test-csrf");
    expect(submit.disabled).toBe(true);
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(window.location.hash).toBe(`#token=${token}`);

    await act(() => { window.dispatchEvent(new Event("pageshow")); });
    expect(submit.disabled).toBe(false);
    expect(form.getAttribute("aria-busy")).toBe("false");
    expect(window.location.hash).toBe(`#token=${token}`);
  });

  it.each(["password", "password_confirm", "mismatch", "csrf", "rate", "unknown"])("can retry a server %s response without a token in boot data", async error => {
    await act(() => root.render(<RecoveryPage boot={{ ...boot, error }} />));
    const form = host.querySelector("form")!;
    expect(form).not.toBeNull();
    expect(document.activeElement).toBe(host.querySelector("#recovery-error"));
    expect(new FormData(form).get("token")).toBe(token);
    expect(form.getAttribute("action")).toBe(`/ui/password-reset#token=${token}`);
    if (error === "password" || error === "password_confirm" || error === "mismatch") {
      const fieldId = error === "password" ? "password-reset-password" : "password-reset-password-confirm";
      expect(host.querySelector(`#${fieldId}`)?.getAttribute("aria-invalid")).toBe("true");
      expect(host.querySelector(`#${fieldId}`)?.getAttribute("aria-describedby")).toContain(`${fieldId}-error`);
      expect(host.querySelector(`a[href="#${fieldId}"]`)).not.toBeNull();
    }
    fillPassword("corrected-password");
    expect((await submitForm()).defaultPrevented).toBe(false);
  });

  it.each(["", "#token=short", `?token=${token}`])("provides a replacement link for missing or invalid fragment %s", async hash => {
    window.history.replaceState({}, "", `/ui/password-reset${hash}`);
    await act(() => root.render(<RecoveryPage boot={boot} />));
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).toContain("Ссылка недействительна, устарела или уже использована");
    expect(host.querySelector(".recovery-request-link")?.getAttribute("href")).toBe("/ui/forgot-password");
    expect(document.activeElement).toBe(host.querySelector("#recovery-error"));
  });

  it("does not offer an editable form for an expired or used server token", async () => {
    await act(() => root.render(<RecoveryPage boot={{ ...boot, error: "token" }} />));
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector(".recovery-request-link")).not.toBeNull();
    expect(window.location.hash).toBe(`#token=${token}`);
  });

  it("updates the form when a fragment is added or removed", async () => {
    await act(() => root.render(<RecoveryPage boot={boot} />));
    window.history.replaceState({}, "", "/ui/password-reset");
    await act(() => { window.dispatchEvent(new Event("hashchange")); });
    expect(host.querySelector("form")).toBeNull();
    window.history.replaceState({}, "", `/ui/password-reset#token=${token}`);
    await act(() => { window.dispatchEvent(new Event("hashchange")); });
    expect(new FormData(host.querySelector("form")!).get("token")).toBe(token);
  });

  it("rechecks a silently changed fragment before submitting", async () => {
    await act(() => root.render(<RecoveryPage boot={boot} />));
    fillPassword("valid-password");
    const newToken = "b".repeat(43);
    window.history.replaceState({}, "", `/ui/password-reset#token=${newToken}`);
    expect((await submitForm()).defaultPrevented).toBe(false);
    const form = host.querySelector("form")!;
    expect(new FormData(form).get("token")).toBe(newToken);
    expect(form.getAttribute("action")).toBe(`/ui/password-reset#token=${newToken}`);
  });

  it("blocks a silently removed token without posting a stale hidden token", async () => {
    await act(() => root.render(<RecoveryPage boot={boot} />));
    fillPassword("valid-password");
    window.history.replaceState({}, "", "/ui/password-reset");
    expect((await submitForm()).defaultPrevented).toBe(true);
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector(".recovery-request-link")).not.toBeNull();
    window.history.replaceState({}, "", `/ui/password-reset#token=${"c".repeat(43)}`);
    await act(() => { window.dispatchEvent(new Event("hashchange")); });
    expect(host.querySelector("form")).not.toBeNull();
    fillPassword("valid-password");
    expect((await submitForm()).defaultPrevented).toBe(false);
  });

  it("retains both field nodes and password values across independent visibility toggles", async () => {
    await act(() => root.render(<RecoveryPage boot={boot} />));
    fillPassword("saved-password");
    const passwords = [...host.querySelectorAll<HTMLInputElement>('input[autocomplete="new-password"]')];
    const toggles = [...host.querySelectorAll<HTMLButtonElement>(".password-toggle")];
    for (let index = 0; index < toggles.length; index++) {
      await act(() => toggles[index].click());
      expect(host.querySelector(`#${passwords[index].id}`)).toBe(passwords[index]);
      expect(passwords[index].type).toBe("text");
      expect(passwords[index].value).toBe("saved-password");
      expect(toggles[index].getAttribute("aria-pressed")).toBe("true");
      await act(() => toggles[index].click());
      expect(passwords[index].type).toBe("password");
      expect(passwords[index].value).toBe("saved-password");
    }
  });

  it("allows paste in both password fields", async () => {
    await act(() => root.render(<RecoveryPage boot={boot} />));
    for (const password of host.querySelectorAll<HTMLInputElement>('input[autocomplete="new-password"]')) {
      const paste = new Event("paste", { bubbles: true, cancelable: true });
      await act(() => { password.dispatchEvent(paste); });
      expect(paste.defaultPrevented).toBe(false);
    }
  });

  it("links mismatch feedback to confirmation, focuses it, and keeps entered values and the token", async () => {
    await act(() => root.render(<RecoveryPage boot={boot} />));
    fillPassword("first-password", "second-password");
    expect((await submitForm()).defaultPrevented).toBe(true);
    const confirmation = host.querySelector<HTMLInputElement>("#password-reset-password-confirm")!;
    expect(document.activeElement).toBe(confirmation);
    expect(confirmation.value).toBe("second-password");
    expect(confirmation.getAttribute("aria-invalid")).toBe("true");
    expect(confirmation.getAttribute("aria-describedby")).toBe("password-reset-password-confirm-error");
    expect(host.querySelector("#password-reset-password-confirm-error")?.textContent).toContain("Пароли не совпадают");
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    const link = host.querySelector<HTMLAnchorElement>('a[href="#password-reset-password-confirm"]')!;
    await act(() => link.click());
    expect(document.activeElement).toBe(confirmation);
    expect(window.location.hash).toBe(`#token=${token}`);
  });

  it("focuses the linked summary when both password fields have client errors", async () => {
    await act(() => root.render(<RecoveryPage boot={boot} />));
    fillPassword("short", "different");
    expect((await submitForm()).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(host.querySelector("#recovery-error"));
    expect(host.querySelectorAll(".recovery-error-links a")).toHaveLength(2);
    expect(host.querySelector("#password-reset-password")?.getAttribute("aria-invalid")).toBe("true");
    expect(host.querySelector("#password-reset-password-confirm")?.getAttribute("aria-invalid")).toBe("true");
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    expect(window.location.hash).toBe(`#token=${token}`);
  });

  const emoji = String.fromCodePoint(0x1f600);
  it.each([[emoji.repeat(4), false], [emoji.repeat(8), true], [emoji.repeat(65), true], [emoji.repeat(128), true], [emoji.repeat(129), false]])("validates Unicode password %s without UTF-16 HTML limits", async (password, valid) => {
    await act(() => root.render(<RecoveryPage boot={boot} />));
    fillPassword(password);
    expect((await submitForm()).defaultPrevented).toBe(!valid);
    const input = host.querySelector<HTMLInputElement>("#password-reset-password")!;
    expect(input.value).toBe(password);
    expect(input.hasAttribute("minlength")).toBe(false);
    expect(input.hasAttribute("maxlength")).toBe(false);
    expect(input.hasAttribute("value")).toBe(false);
    if (!valid) {
      expect(document.activeElement).toBe(input);
      expect(input.getAttribute("aria-describedby")).toBe("password-reset-hint password-reset-password-error");
    }
  });

  it("rechecks both autofilled DOM values and clears a stale error even without an input event", async () => {
    await act(() => root.render(<RecoveryPage boot={boot} />));
    fillPassword("valid-password", "different-password");
    expect((await submitForm()).defaultPrevented).toBe(true);
    fillPassword(emoji.repeat(65));
    expect((await submitForm()).defaultPrevented).toBe(false);
    expect(host.querySelector("#password-reset-password-confirm-error")).toBeNull();
    expect(new FormData(host.querySelector("form")!).get("password_confirm")).toBe(emoji.repeat(65));
  });

  it("preserves the secret fragment when the skip link is used", async () => {
    await act(() => root.render(<PublicApp boot={boot} />));
    await act(() => host.querySelector<HTMLAnchorElement>(".skip-link")!.click());
    expect(window.location.hash).toBe(`#token=${token}`);
    expect(document.activeElement).toBe(host.querySelector("#main-content"));
  });

  it("posts Unicode recovery email and restores pending state after pageshow", async () => {
    await act(() => root.render(<RecoveryPage boot={{ ...boot, page: "forgot-password", email: "почта@пример.рф" }} />));
    const form = host.querySelector("form")!;
    expect((await submitForm()).defaultPrevented).toBe(false);
    expect(form.getAttribute("action")).toBe("/ui/forgot-password");
    expect(form.method).toBe("post");
    expect(new FormData(form).get("email")).toBe("почта@пример.рф");
    expect(new FormData(form).get("csrf_token")).toBe("test-csrf");
    const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(true);
    await act(() => { window.dispatchEvent(new Event("pageshow")); });
    expect(submit.disabled).toBe(false);
  });

  it("focuses and connects the recovery email error without clearing the email", async () => {
    await act(() => root.render(<RecoveryPage boot={{ ...boot, page: "forgot-password", email: "entered-email", error: "email" }} />));
    const email = host.querySelector<HTMLInputElement>("#forgot-password-email")!;
    expect(document.activeElement).toBe(host.querySelector("#recovery-error"));
    expect(email.value).toBe("entered-email");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(email.getAttribute("aria-describedby")).toBe("forgot-password-email-error");
    expect(host.querySelector('a[href="#forgot-password-email"]')).not.toBeNull();
  });

  it("prevents empty recovery requests and disabled sender requests", async () => {
    await act(() => root.render(<RecoveryPage boot={{ ...boot, page: "forgot-password" }} />));
    expect((await submitForm()).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(host.querySelector("#forgot-password-email"));
    await act(() => root.render(<RecoveryPage boot={{ ...boot, page: "forgot-password", email: "student@example.com", mailMode: "disabled" }} />));
    expect((await submitForm()).defaultPrevented).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  });
});
