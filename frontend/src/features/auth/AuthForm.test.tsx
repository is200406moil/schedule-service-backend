import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthForm } from "./AuthForm";
import { PrivacyPage } from "./PrivacyPage";
import type { AuthBoot } from "./types";

const boot: AuthBoot = { page: "register", csrfToken: "test-csrf", email: "", error: null, ok: null };

describe("public account forms", () => {
  it("requires only email and password and preserves native form submission", () => {
    const html = renderToStaticMarkup(<AuthForm boot={boot} />);
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/ui/register"');
    expect(html).toContain('name="csrf_token" value="test-csrf"');
    expect(html.match(/required=""/g)).toHaveLength(2);
    expect(html).not.toContain('minLength=');
    expect(html).not.toContain('maxLength=');
    expect(html).toContain('inputMode="email"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('type="button" aria-controls="register-password"');
    expect(html).toContain('href="/ui/privacy"');
    for (const field of ["first_name", "last_name", "group_name", "avatar_file"]) {
      expect(html).not.toContain(`name="${field}"`);
    }
  });

  it("uses current-password autocomplete on login, without exposing registration limits", () => {
    const html = renderToStaticMarkup(<AuthForm boot={{ ...boot, page: "login" }} />);
    expect(html).toContain('autoComplete="current-password"');
    expect(html).not.toContain('minLength="8"');
    expect(html).toContain('action="/ui/login"');
  });

  it("links password errors, retains escaped email and renders the full password range", () => {
    const html = renderToStaticMarkup(<AuthForm boot={{ ...boot, error: "password", email: '<script>alert("x")</script>' }} />);
    expect(html).toContain('aria-describedby="password-hint auth-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert" tabindex="-1"');
    expect(html).toContain("от 8 до 128 символов");
    expect(html).not.toContain('<script>alert("x")</script>');
  });

  it("offers recovery when an account exists", () => {
    const html = renderToStaticMarkup(<AuthForm boot={{ ...boot, error: "exists" }} />);
    expect(html).toContain("Аккаунт с такой почтой уже существует");
    expect(html).toContain('href="/ui/login"');
  });

  it("describes actual storage, local-only scope, contact and cookie notice", () => {
    const html = renderToStaticMarkup(<PrivacyPage boot={{ page: "privacy", operatorName: "Test Operator", contactEmail: "contact@example.com", cookieMinutes: 45 }} />);
    expect(html).toContain('href="mailto:contact@example.com"');
    expect(html).toContain("45 мин.");
    expect(html).toContain("Для локальной учебной версии");
    expect(html).toContain("Автоматического удаления по сроку");
    expect(html).toContain("localStorage");
    expect(html).toContain("fastapi.tiangolo.com");
  });
});
