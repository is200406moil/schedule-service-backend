import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthForm } from "./AuthForm";
import { PublicApp } from "./PublicApp";
import { VerificationPage } from "./VerificationPage";
import type { VerificationBoot } from "./types";

const boot: VerificationBoot = { page: "email-verification", csrfToken: "test-csrf", email: "student@example.com", error: null, ok: null, mailMode: "smtp", verificationRequired: true };

describe("email verification markup", () => {
  it("uses the existing card and a labelled email field in a native POST", () => {
    const html = renderToStaticMarkup(<VerificationPage boot={boot} />);
    expect(html).toContain('class="auth-card"');
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/ui/email-verification"');
    expect(html).toContain('name="csrf_token" value="test-csrf"');
    expect(html).toContain('for="email-verification-email"');
    expect(html).toContain('type="email"');
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('value="student@example.com"');
    expect(html).toContain('href="/ui/login"');
    expect(html).not.toContain('name="password"');
    expect(html).not.toContain("Тестовый режим");
    expect(html).toContain(">Отправить письмо</button>");
    expect(html).not.toContain("Отправить ещё раз");
  });

  it("keeps the same accepted request message without disclosing account existence", () => {
    const html = renderToStaticMarkup(<VerificationPage boot={{ ...boot, ok: "requested" }} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Если для этой почты нужно подтверждение");
    expect(html).toContain("Проверьте почту");
    expect(html).not.toContain("Аккаунт с такой почтой не");
    expect(html).not.toContain("Почта подтверждена");
  });

  it("states that registration requires confirmation before sign-in", () => {
    const html = renderToStaticMarkup(<VerificationPage boot={{ ...boot, ok: "registered" }} />);
    expect(html).toContain("Аккаунт создан. Подтвердите почту по ссылке из письма, прежде чем войти.");
    const register = renderToStaticMarkup(<AuthForm boot={{ page: "register", csrfToken: "csrf", email: "", error: null, ok: null, mailMode: "smtp", verificationRequired: true }} />);
    expect(register).toContain("После регистрации подтвердите почту, чтобы войти.");
  });

  it.each(["registered", "requested"] as const)("prioritizes the existing link and labels a %s request as a resend", ok => {
    const html = renderToStaticMarkup(<VerificationPage boot={{ ...boot, ok }} />);
    expect(html).toContain('id="email-verification-title">Проверьте почту</h1>');
    expect(html).toContain("Если письмо уже пришло, откройте ссылку и подтвердите почту.");
    expect(html).toContain("Если письмо не пришло, укажите почту и запросите его ещё раз.");
    expect(html).toContain(">Отправить ещё раз</button>");
    expect(html).not.toContain(">Отправить письмо</button>");
  });

  it("describes local files honestly without claiming delivery to an inbox", () => {
    const html = renderToStaticMarkup(<VerificationPage boot={{ ...boot, ok: "requested", mailMode: "local" }} />);
    expect(html).toContain("тестовое письмо со ссылкой сохранено локально");
    expect(html).toContain(".local/mail");
    expect(html).toContain("на почту не отправляется");
    expect(html).not.toContain("мы отправили письмо");
    expect(html).not.toContain("Проверьте почту, в том числе");
    expect(html).toContain("Если тестовое письмо уже сохранено, откройте ссылку из него");
    expect(html).toContain("Если локального письма нет");
    expect(html).toContain(">Отправить ещё раз</button>");
    const register = renderToStaticMarkup(<AuthForm boot={{ page: "register", csrfToken: "csrf", email: "", error: null, ok: null, mailMode: "local", verificationRequired: true }} />);
    expect(register).toContain(".local/mail");
    expect(register).toContain("на почту не отправляется");
  });

  it("keeps sign-in available in disabled mode without claiming verification or sending", () => {
    const html = renderToStaticMarkup(<VerificationPage boot={{ ...boot, ok: "requested", mailMode: "disabled", verificationRequired: false }} />);
    expect(html).toContain("Новое письмо пока нельзя запросить");
    expect(html).toContain("можно войти без подтверждения");
    expect(html).toContain('type="submit" class="auth-submit" disabled=""');
    expect(html).toContain('href="/ui/login"');
    expect(html).not.toContain("Почта подтверждена");
    expect(html).not.toContain("мы отправили письмо");
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain("Отправить ещё раз");
  });

  it("renders an unverified login email directly in the request page without a password", () => {
    const html = renderToStaticMarkup(<PublicApp boot={{ ...boot, error: "unverified" }} />);
    expect(html).toContain("Чтобы войти, подтвердите почту");
    expect(html).toContain('action="/ui/email-verification"');
    expect(html).toContain('value="student@example.com"');
    expect(html).not.toContain('name="password"');
    expect(html).toContain(">Отправить письмо</button>");
    expect(html).not.toContain("Если письмо не пришло");
  });

  it("routes login with delivery metadata to login and reports successful verification", () => {
    const html = renderToStaticMarkup(<PublicApp boot={{ page: "login", csrfToken: "csrf", email: "", error: null, ok: "email-verified", mailMode: "smtp", verificationRequired: true }} />);
    expect(html).toContain('action="/ui/login"');
    expect(html).toContain('name="password"');
    expect(html).toContain("Почта подтверждена. Войдите с вашей почтой и паролем.");
  });

  it("offers a new link instead of an unusable form when no token is present", () => {
    const html = renderToStaticMarkup(<VerificationPage boot={{ ...boot, page: "verify-email" }} />);
    expect(html).toContain("Ссылка недействительна, устарела или уже использована");
    expect(html).toContain('href="/ui/email-verification"');
    expect(html).toContain("Запросить новую ссылку");
    expect(html).not.toContain("<form");
    expect(Object.keys(boot)).not.toContain("token");
  });
});
