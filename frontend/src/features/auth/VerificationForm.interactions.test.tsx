// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicApp } from "./PublicApp";
import { VerificationPage } from "./VerificationPage";
import type { VerificationBoot } from "./types";

const token = "a".repeat(43);
const boot: VerificationBoot = { page: "verify-email", csrfToken: "test-csrf", email: "student@example.com", error: null, ok: null, mailMode: "smtp", verificationRequired: true };
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState({}, "", `/ui/verify-email#token=${token}`);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function submitForm() {
  const event = new Event("submit", { bubbles: true, cancelable: true });
  await act(() => { host.querySelector("form")!.dispatchEvent(event); });
  return event;
}

describe("email verification interactions", () => {
  it("waits for an explicit confirmation and keeps the token out of GET and boot data", async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit");
    const requestSubmit = vi.spyOn(HTMLFormElement.prototype, "requestSubmit");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await act(() => root.render(<VerificationPage boot={boot} />));
    const form = host.querySelector("form")!;
    expect(submit).not.toHaveBeenCalled();
    expect(requestSubmit).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(form.method).toBe("post");
    expect(form.getAttribute("action")).toBe(`/ui/verify-email#token=${token}`);
    expect(new FormData(form).get("token")).toBe(token);
    expect(window.location.search).toBe("");
    expect(Object.keys(boot)).not.toContain("token");
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent).toBe("Подтвердить почту");
  });

  it("uses a native POST with CSRF and restores the button after browser restoration", async () => {
    await act(() => root.render(<VerificationPage boot={boot} />));
    expect((await submitForm()).defaultPrevented).toBe(false);
    const form = host.querySelector("form")!;
    const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(new FormData(form).get("token")).toBe(token);
    expect(new FormData(form).get("csrf_token")).toBe("test-csrf");
    expect(submit.disabled).toBe(true);
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(submit.textContent).toBe("Подтверждаем почту…");
    expect((await submitForm()).defaultPrevented).toBe(true);
    await act(() => { window.dispatchEvent(new Event("pageshow")); });
    expect(submit.disabled).toBe(false);
    expect(form.getAttribute("aria-busy")).toBe("false");
    expect(window.location.hash).toBe(`#token=${token}`);
  });

  it.each(["csrf", "rate"])("retains the fragment and focuses a retryable %s error", async error => {
    await act(() => root.render(<VerificationPage boot={{ ...boot, error }} />));
    const form = host.querySelector("form")!;
    expect(document.activeElement).toBe(host.querySelector("#verification-error"));
    expect(form.getAttribute("action")).toBe(`/ui/verify-email#token=${token}`);
    expect(new FormData(form).get("token")).toBe(token);
    expect((await submitForm()).defaultPrevented).toBe(false);
  });

  it.each(["", "#token=short", `?token=${token}`, `#token=${token}&other=x`, `#token=${token}&token=${token}`, `#token=${"a".repeat(42)}%61`])("offers a replacement for missing or malformed fragment %s", async suffix => {
    window.history.replaceState({}, "", `/ui/verify-email${suffix}`);
    await act(() => root.render(<VerificationPage boot={boot} />));
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector(".recovery-request-link")?.getAttribute("href")).toBe("/ui/email-verification");
    expect(document.activeElement).toBe(host.querySelector("#verification-error"));
  });

  it("offers a replacement for an expired or consumed server token", async () => {
    await act(() => root.render(<VerificationPage boot={{ ...boot, error: "token" }} />));
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector(".recovery-request-link")).not.toBeNull();
  });

  it("synchronizes a silently changed fragment with the hidden POST field", async () => {
    await act(() => root.render(<VerificationPage boot={boot} />));
    const nextToken = "b".repeat(43);
    window.history.replaceState({}, "", `/ui/verify-email#token=${nextToken}`);
    expect((await submitForm()).defaultPrevented).toBe(false);
    const form = host.querySelector("form")!;
    expect(new FormData(form).get("token")).toBe(nextToken);
    expect(form.getAttribute("action")).toBe(`/ui/verify-email#token=${nextToken}`);
  });

  it("blocks a silently removed fragment instead of posting a stale token", async () => {
    await act(() => root.render(<VerificationPage boot={boot} />));
    window.history.replaceState({}, "", "/ui/verify-email");
    expect((await submitForm()).defaultPrevented).toBe(true);
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector(".recovery-request-link")).not.toBeNull();
  });

  it("updates availability when the fragment changes without confirming automatically", async () => {
    await act(() => root.render(<VerificationPage boot={boot} />));
    window.history.replaceState({}, "", "/ui/verify-email");
    await act(() => { window.dispatchEvent(new Event("hashchange")); });
    expect(host.querySelector("form")).toBeNull();
    const nextToken = "c".repeat(43);
    window.history.replaceState({}, "", `/ui/verify-email#token=${nextToken}`);
    await act(() => { window.dispatchEvent(new Event("hashchange")); });
    expect(new FormData(host.querySelector("form")!).get("token")).toBe(nextToken);
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  it("keeps the secret fragment when using the skip link", async () => {
    await act(() => root.render(<PublicApp boot={boot} />));
    await act(() => host.querySelector<HTMLAnchorElement>(".skip-link")!.click());
    expect(window.location.hash).toBe(`#token=${token}`);
    expect(document.activeElement).toBe(host.querySelector("#main-content"));
  });

  it("focuses server email feedback and links the summary to the retained field", async () => {
    await act(() => root.render(<VerificationPage boot={{ ...boot, page: "email-verification", email: "entered-email", error: "email" }} />));
    const email = host.querySelector<HTMLInputElement>("#email-verification-email")!;
    expect(document.activeElement).toBe(host.querySelector("#verification-error"));
    expect(email.value).toBe("entered-email");
    expect(email.type).toBe("email");
    expect(email.autocomplete).toBe("email");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(email.getAttribute("aria-describedby")).toBe("email-verification-email-error");
    await act(() => host.querySelector<HTMLAnchorElement>('a[href="#email-verification-email"]')!.click());
    expect(document.activeElement).toBe(email);
    expect(window.location.hash).toBe(`#token=${token}`);
  });

  it("prevents an empty request with focused inline feedback and a linked summary", async () => {
    await act(() => root.render(<VerificationPage boot={{ ...boot, page: "email-verification", email: "" }} />));
    expect((await submitForm()).defaultPrevented).toBe(true);
    const email = host.querySelector<HTMLInputElement>("#email-verification-email")!;
    expect(document.activeElement).toBe(email);
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(host.querySelector("#email-verification-email-error")?.textContent).toContain("Введите корректный адрес");
    expect(host.querySelector("#verification-error")).not.toBeNull();
    expect(host.querySelector('a[href="#email-verification-email"]')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
    email.value = "student@example.com";
    await act(() => { email.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(host.querySelector("#email-verification-email-error")).toBeNull();
    expect((await submitForm()).defaultPrevented).toBe(false);
  });

  it("posts request email with CSRF and restores pending state after pageshow", async () => {
    await act(() => root.render(<VerificationPage boot={{ ...boot, page: "email-verification" }} />));
    expect((await submitForm()).defaultPrevented).toBe(false);
    const form = host.querySelector("form")!;
    expect(form.method).toBe("post");
    expect(form.getAttribute("action")).toBe("/ui/email-verification");
    expect(new FormData(form).get("email")).toBe("student@example.com");
    expect(new FormData(form).get("csrf_token")).toBe("test-csrf");
    const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(true);
    expect(submit.textContent).toBe("Отправляем письмо…");
    expect((await submitForm()).defaultPrevented).toBe(true);
    await act(() => { window.dispatchEvent(new Event("pageshow")); });
    expect(submit.disabled).toBe(false);
  });

  it.each(["registered", "requested"] as const)("keeps a %s resend native and restores its label after pageshow", async ok => {
    await act(() => root.render(<VerificationPage boot={{ ...boot, page: "email-verification", ok }} />));
    const form = host.querySelector("form")!;
    const button = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.textContent).toBe("Отправить ещё раз");
    expect((await submitForm()).defaultPrevented).toBe(false);
    expect(form.getAttribute("action")).toBe("/ui/email-verification");
    expect(new FormData(form).get("email")).toBe("student@example.com");
    expect(new FormData(form).get("csrf_token")).toBe("test-csrf");
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Отправляем письмо…");
    await act(() => { window.dispatchEvent(new Event("pageshow")); });
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("Отправить ещё раз");
  });

  it("lets the server validate internationalized email while keeping the email keyboard", async () => {
    await act(() => root.render(<VerificationPage boot={{ ...boot, page: "email-verification", email: "почта@пример.рф" }} />));
    const form = host.querySelector("form")!;
    expect(form.noValidate).toBe(true);
    expect(host.querySelector<HTMLInputElement>("#email-verification-email")!.type).toBe("email");
    expect((await submitForm()).defaultPrevented).toBe(false);
    expect(new FormData(form).get("email")).toBe("почта@пример.рф");
  });

  it("blocks disabled sender requests and offers sign-in", async () => {
    await act(() => root.render(<VerificationPage boot={{ ...boot, page: "email-verification", mailMode: "disabled", verificationRequired: false }} />));
    expect((await submitForm()).defaultPrevented).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    expect(host.querySelector('a[href="/ui/login"]')).not.toBeNull();
  });

  it("lets an existing link be confirmed explicitly when sending is disabled", async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit");
    const requestSubmit = vi.spyOn(HTMLFormElement.prototype, "requestSubmit");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await act(() => root.render(<VerificationPage boot={{ ...boot, mailMode: "disabled", verificationRequired: false }} />));
    const form = host.querySelector("form")!;
    const button = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(form).not.toBeNull();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("Подтвердить почту");
    expect(submit).not.toHaveBeenCalled();
    expect(requestSubmit).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect((await submitForm()).defaultPrevented).toBe(false);
    expect(form.method).toBe("post");
    expect(form.getAttribute("action")).toBe(`/ui/verify-email#token=${token}`);
    expect(new FormData(form).get("token")).toBe(token);
    expect(new FormData(form).get("csrf_token")).toBe("test-csrf");
    expect(button.disabled).toBe(true);
  });

  it("explains that a missing disabled-mode link cannot be resent and retains the request action", async () => {
    window.history.replaceState({}, "", "/ui/verify-email");
    await act(() => root.render(<VerificationPage boot={{ ...boot, mailMode: "disabled", verificationRequired: false }} />));
    expect(host.querySelector("form")).toBeNull();
    expect(host.querySelector(".recovery-request-link")?.getAttribute("href")).toBe("/ui/email-verification");
    expect(host.textContent).toContain("Новое письмо пока нельзя запросить");
    expect(host.textContent).toContain("можно войти без подтверждения");
    expect(host.querySelector('a[href="/ui/login"]')).not.toBeNull();
    expect(document.activeElement).toBe(host.querySelector("#verification-error"));
  });
});
