import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AuthFeedback } from "./AuthFeedback";
import { AuthEmailField, AuthPasswordField } from "./AuthFields";
import type { AuthBoot } from "./types";

export function AuthForm({ boot }: { boot: AuthBoot }) {
  const registration = boot.page === "register";
  const [pending, setPending] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const id = boot.page;

  useEffect(() => {
    const resetPending = () => setPending(false);
    window.addEventListener("pageshow", resetPending);
    return () => window.removeEventListener("pageshow", resetPending);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    const input = passwordInput.current;
    const length = Array.from(input?.value ?? "").length;
    if (length < (registration ? 8 : 1) || length > 128) {
      event.preventDefault();
      setPasswordError(registration ? "Пароль должен содержать от 8 до 128 символов." : "Введите пароль длиной от 1 до 128 символов.");
      input?.focus();
      return;
    }
    setPasswordError(null);
    setPending(true);
  }

  return (
    <section className="auth-card" aria-labelledby={`${id}-title`}>
      <div className="auth-heading">
        <h1 id={`${id}-title`}>{registration ? "Регистрация" : "Вход"}</h1>
        <p>{registration ? "Группу и фото можно добавить в профиле." : "Войдите, чтобы открыть расписание и задачи."}</p>
      </div>
      <AuthFeedback error={boot.error} ok={boot.ok} registration={registration} />
      {registration && boot.mailMode === "local" ? <p className="recovery-mode-notice">Тестовый режим: письмо для подтверждения почты сохраняется в .local/mail, на почту не отправляется.</p> : null}
      {registration && boot.mailMode === "disabled" ? <p className="recovery-mode-notice">Отправка писем пока недоступна. В этой версии можно войти без подтверждения почты.</p> : null}
      <form method="post" action={`/ui/${id}`} className="auth-form" onSubmit={submit} aria-busy={pending}>
        <input type="hidden" name="csrf_token" value={boot.csrfToken} />
        <AuthEmailField page={boot.page} email={boot.email} error={boot.error} />
        <AuthPasswordField page={boot.page} error={boot.error} inputRef={passwordInput} clientError={passwordError} onInput={() => setPasswordError(null)} />
        {registration ? <p className="registration-notice">{boot.verificationRequired ? <>После регистрации подтвердите почту, чтобы войти. </> : null}Как сервис хранит и использует данные — в <a href="/ui/privacy">политике конфиденциальности</a>.</p> : null}
        <button type="submit" className="auth-submit" disabled={pending}>{pending ? (registration ? "Создаём аккаунт…" : "Входим…") : (registration ? "Создать аккаунт" : "Войти")}</button>
      </form>
      <p className="auth-switch">{registration ? <>Уже есть аккаунт? <a href="/ui/login">Войти</a></> : <>Нет аккаунта? <a href="/ui/register">Зарегистрироваться</a></>}</p>
    </section>
  );
}
