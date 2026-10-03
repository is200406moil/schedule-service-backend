// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "./AuthForm";
import type { AuthBoot } from "./types";

const boot: AuthBoot = { page: "register", csrfToken: "test-csrf", email: "student@example.com", error: null, ok: null };
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("account form interactions", () => {
  it("keeps the entered password and field node when visibility changes", async () => {
    await act(() => root.render(<AuthForm boot={boot} />));
    const password = host.querySelector<HTMLInputElement>("#register-password")!;
    const toggle = host.querySelector<HTMLButtonElement>(".password-toggle")!;
    password.value = "entered-password";

    await act(() => toggle.click());
    expect(host.querySelector("#register-password")).toBe(password);
    expect(password.type).toBe("text");
    expect(password.value).toBe("entered-password");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    await act(() => toggle.click());
    expect(password.type).toBe("password");
    expect(password.value).toBe("entered-password");
  });

  it("allows native POST with CSRF and restores submit after browser page restoration", async () => {
    await act(() => root.render(<AuthForm boot={boot} />));
    const form = host.querySelector("form")!;
    host.querySelector<HTMLInputElement>("#register-password")!.value = "valid-password";
    const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const event = new Event("submit", { bubbles: true, cancelable: true });

    await act(() => { form.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    expect(form.method).toBe("post");
    expect(form.getAttribute("action")).toBe("/ui/register");
    expect(new FormData(form).get("csrf_token")).toBe("test-csrf");
    expect(submit.disabled).toBe(true);
    expect(form.getAttribute("aria-busy")).toBe("true");

    await act(() => { window.dispatchEvent(new Event("pageshow")); });
    expect(submit.disabled).toBe(false);
    expect(form.getAttribute("aria-busy")).toBe("false");
  });

  it("focuses server feedback and keeps both invalid credential fields linked to it", async () => {
    await act(() => root.render(<AuthForm boot={{ ...boot, page: "login", error: "auth" }} />));
    const feedback = host.querySelector("#auth-error")!;
    expect(document.activeElement).toBe(feedback);
    for (const id of ["login-email", "login-password"]) {
      const input = host.querySelector<HTMLInputElement>(`#${id}`)!;
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.getAttribute("aria-describedby")).toBe("auth-error");
    }
  });

  const emoji = String.fromCodePoint(0x1f600);
  it.each([
    ["four emoji", emoji.repeat(4), false],
    ["eight emoji", emoji.repeat(8), true],
    ["65 emoji", emoji.repeat(65), true],
    ["128 emoji", emoji.repeat(128), true],
    ["129 emoji", emoji.repeat(129), false],
    ["seven mixed characters", `abcDE${emoji.repeat(2)}`, false],
    ["eight mixed characters", `abcDEF${emoji.repeat(2)}`, true],
    ["128 ASCII characters", "a".repeat(128), true],
    ["129 ASCII characters", "a".repeat(129), false],
  ])("checks registration code-point length for %s", async (_name, value, valid) => {
    await act(() => root.render(<AuthForm boot={boot} />));
    const form = host.querySelector("form")!;
    const password = host.querySelector<HTMLInputElement>("#register-password")!;
    const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    password.value = value;
    const event = new Event("submit", { bubbles: true, cancelable: true });

    await act(() => { form.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(!valid);
    expect(submit.disabled).toBe(valid);
    expect(form.getAttribute("aria-busy")).toBe(String(valid));
    expect(password.value).toBe(value);
    expect(new FormData(form).get("password")).toBe(value);
    expect(password.hasAttribute("minlength")).toBe(false);
    expect(password.hasAttribute("maxlength")).toBe(false);
    expect(password.hasAttribute("value")).toBe(false);
    if (valid) {
      expect(host.querySelector("#register-password-error")).toBeNull();
      expect(password.getAttribute("aria-invalid")).toBeNull();
    } else {
      expect(document.activeElement).toBe(password);
      expect(password.getAttribute("aria-invalid")).toBe("true");
      expect(password.getAttribute("aria-describedby")).toBe("password-hint register-password-error");
      expect(host.querySelector("#register-password-error")?.getAttribute("role")).toBe("alert");
      expect(host.querySelector("#register-password-error")?.textContent).toBe("Пароль должен содержать от 8 до 128 символов.");
    }
  });

  it.each([
    ["one character", emoji, true],
    ["65 emoji", emoji.repeat(65), true],
    ["128 emoji", emoji.repeat(128), true],
    ["129 emoji", emoji.repeat(129), false],
    ["empty password", "", false],
  ])("checks login code-point length for %s", async (_name, value, valid) => {
    await act(() => root.render(<AuthForm boot={{ ...boot, page: "login" }} />));
    const form = host.querySelector("form")!;
    const password = host.querySelector<HTMLInputElement>("#login-password")!;
    password.value = value;
    const event = new Event("submit", { bubbles: true, cancelable: true });

    await act(() => { form.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(!valid);
    expect(new FormData(form).get("password")).toBe(value);
    if (!valid) {
      expect(document.activeElement).toBe(password);
      expect(password.getAttribute("aria-describedby")).toBe("login-password-error");
      expect(host.querySelector("#login-password-error")?.textContent).toBe("Введите пароль длиной от 1 до 128 символов.");
    }
  });

  it("clears a client error on input and permits correction without replacing the field", async () => {
    await act(() => root.render(<AuthForm boot={boot} />));
    const form = host.querySelector("form")!;
    const password = host.querySelector<HTMLInputElement>("#register-password")!;
    password.value = emoji.repeat(4);
    await act(() => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(host.querySelector("#register-password-error")).not.toBeNull();

    password.value = emoji.repeat(8);
    await act(() => { password.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(host.querySelector("#register-password-error")).toBeNull();
    expect(password.getAttribute("aria-invalid")).toBeNull();
    expect(password.getAttribute("aria-describedby")).toBe("password-hint");
    expect(password.validationMessage).toBe("");
    expect(host.querySelector("#register-password")).toBe(password);
    const event = new Event("submit", { bubbles: true, cancelable: true });
    await act(() => { form.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
  });

  it("rechecks an autofilled DOM value on submit and removes stale errors without an input event", async () => {
    await act(() => root.render(<AuthForm boot={boot} />));
    const form = host.querySelector("form")!;
    const password = host.querySelector<HTMLInputElement>("#register-password")!;
    password.value = "short";
    await act(() => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(host.querySelector("#register-password-error")).not.toBeNull();

    password.value = emoji.repeat(65);
    const event = new Event("submit", { bubbles: true, cancelable: true });
    await act(() => { form.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    expect(host.querySelector("#register-password-error")).toBeNull();
    expect(password.getAttribute("aria-invalid")).toBeNull();
    expect(password.validationMessage).toBe("");
    expect(new FormData(form).get("password")).toBe(emoji.repeat(65));
  });

  it.each(["почта@example.com", "student@пример.рф"])("lets the server validate Unicode email %s without a native type mismatch", async (value) => {
    await act(() => root.render(<AuthForm boot={boot} />));
    const form = host.querySelector("form")!;
    const email = host.querySelector<HTMLInputElement>("#register-email")!;
    email.value = value;
    host.querySelector<HTMLInputElement>("#register-password")!.value = "valid-password";
    expect(email.type).toBe("text");
    expect(email.inputMode).toBe("email");
    expect(email.autocomplete).toBe("username");
    expect(email.required).toBe(true);
    expect(email.checkValidity()).toBe(true);
    expect(email.validity.typeMismatch).toBe(false);
    expect(new FormData(form).get("email")).toBe(value);
    const event = new Event("submit", { bubbles: true, cancelable: true });
    await act(() => { form.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
  });
});
