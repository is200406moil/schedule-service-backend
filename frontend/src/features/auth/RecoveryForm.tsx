import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { RecoveryNotice } from "./RecoveryNotice";
import { RECOVERY_EMAIL_MESSAGE } from "./recoveryModel";
import type { RecoveryIssue } from "./recoveryModel";
import type { RecoveryBoot } from "./types";

export function RecoveryForm({ boot }: { boot: RecoveryBoot }) {
  const [pending, setPending] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const emailError = clientError ?? (boot.error === "email" ? RECOVERY_EMAIL_MESSAGE : null);
  const issues: RecoveryIssue[] = emailError ? [{ fieldId: "forgot-password-email", message: emailError }] : [];
  const disabled = boot.mailMode === "disabled";

  useEffect(() => {
    const resetPending = () => setPending(false);
    window.addEventListener("pageshow", resetPending);
    return () => window.removeEventListener("pageshow", resetPending);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    if (pending || disabled) {
      event.preventDefault();
      return;
    }
    if (!emailInput.current?.value.trim()) {
      event.preventDefault();
      setClientError(RECOVERY_EMAIL_MESSAGE);
      emailInput.current?.focus();
      return;
    }
    setClientError(null);
    setPending(true);
  }

  return (
    <>
      <RecoveryNotice error={boot.error} issues={issues} requested={boot.ok === "requested" && !disabled} localRequest={boot.mailMode === "local"} />
      {boot.mailMode === "local" ? <p className="recovery-mode-notice">Тестовый режим: письмо сохраняется локально, на почту не отправляется.</p> : null}
      {disabled ? <p className="recovery-mode-notice">Восстановление пароля пока недоступно: в локальной версии не настроена отправка писем.</p> : null}
      <form method="post" action="/ui/forgot-password" className="auth-form" onSubmit={submit} aria-busy={pending}>
        <input type="hidden" name="csrf_token" value={boot.csrfToken} />
        <div className="field-group">
          <label htmlFor="forgot-password-email">Электронная почта</label>
          <input ref={emailInput} type="text" id="forgot-password-email" name="email" defaultValue={boot.email} required autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="name@example.com" onInput={() => setClientError(null)} aria-invalid={Boolean(emailError) || undefined} aria-describedby={emailError ? "forgot-password-email-error" : undefined} />
          {emailError ? <p className="field-error" id="forgot-password-email-error">{emailError}</p> : null}
        </div>
        <button type="submit" className="auth-submit" disabled={pending || disabled}>{pending ? "Отправляем ссылку…" : "Отправить ссылку"}</button>
      </form>
    </>
  );
}
