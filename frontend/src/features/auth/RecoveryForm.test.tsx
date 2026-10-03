import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthForm } from "./AuthForm";
import { PasswordResetForm } from "./PasswordResetForm";
import { RecoveryPage } from "./RecoveryPage";
import type { RecoveryBoot } from "./types";

const boot: RecoveryBoot = { page: "forgot-password", csrfToken: "test-csrf", email: "student@example.com", error: null, ok: null, mailMode: "smtp" };
const token = "a".repeat(43);

describe("password recovery markup", () => {
  it("posts the email and CSRF token using the existing account card", () => {
    const html = renderToStaticMarkup(<RecoveryPage boot={boot} />);
    expect(html).toContain('class="auth-card"');
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/ui/forgot-password"');
    expect(html).toContain('name="csrf_token" value="test-csrf"');
    expect(html).toContain('name="email"');
    expect(html).toContain('inputMode="email"');
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('href="/ui/login"');
    expect(html).toContain("Вернуться ко входу");
    expect(html).not.toContain("Тестовый режим");
  });

  it("keeps the reset token in the action fragment and a hidden POST field, with empty password inputs", () => {
    const html = renderToStaticMarkup(<PasswordResetForm boot={{ ...boot, page: "password-reset" }} token={token} />);
    expect(html).toContain('method="post"');
    expect(html).toContain(`action="/ui/password-reset#token=${token}"`);
    expect(html).toContain('name="csrf_token" value="test-csrf"');
    expect(html).toContain(`type="hidden" name="token" value="${token}"`);
    expect(html).toContain('name="password_confirm"');
    expect(html.match(/autoComplete="new-password"/g)).toHaveLength(2);
    expect(html).not.toMatch(/(?:minLength|maxLength)=/);
    expect(html).not.toMatch(/name="password(?:_confirm)?"[^>]*value=/);
    expect(html).not.toContain("?token=");
    expect(Object.keys(boot)).not.toContain("token");
    expect(Object.keys(boot)).not.toContain("password");
  });

  it("shows a replacement link without a dead editable form when no fragment exists", () => {
    const html = renderToStaticMarkup(<RecoveryPage boot={{ ...boot, page: "password-reset" }} />);
    expect(html).toContain("Ссылка недействительна, устарела или уже использована");
    expect(html).toContain('href="/ui/forgot-password"');
    expect(html).toContain("Запросить новую ссылку");
    expect(html).not.toContain("<form");
    expect(html).not.toContain('name="password"');
  });

  it("uses the same accepted message without exposing account existence", () => {
    const html = renderToStaticMarkup(<RecoveryPage boot={{ ...boot, ok: "requested" }} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Если аккаунт с такой почтой есть");
    expect(html).not.toContain("Аккаунт с такой почтой не");
  });

  it("states local delivery honestly and explains disabled delivery", () => {
    const local = renderToStaticMarkup(<RecoveryPage boot={{ ...boot, mailMode: "local", ok: "requested" }} />);
    expect(local).toContain("Тестовый режим: письмо сохраняется локально, на почту не отправляется.");
    expect(local).toContain("Если аккаунт с такой почтой есть, тестовое письмо");
    expect(local).toContain("сохранено локально");
    expect(local).not.toContain("мы отправили письмо");
    const disabled = renderToStaticMarkup(<RecoveryPage boot={{ ...boot, mailMode: "disabled", error: "unavailable" }} />);
    expect(disabled).toContain("не настроена отправка писем");
    expect(disabled).toContain('type="submit" class="auth-submit" disabled=""');
    expect(disabled).not.toContain("Аккаунт с такой почтой");
  });

  it("adds a recovery link to login and an explicit success message after reset", () => {
    const html = renderToStaticMarkup(<AuthForm boot={{ page: "login", csrfToken: "csrf", email: "", error: null, ok: "password-reset" }} />);
    expect(html).toContain('class="auth-recovery-link" href="/ui/forgot-password"');
    expect(html).toContain("Пароль изменён. Войдите с новым паролем.");
  });
});
