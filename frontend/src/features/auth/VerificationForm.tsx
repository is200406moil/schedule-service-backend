import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { VerificationNotice, VerificationUnavailable } from "./VerificationNotice";
import { VERIFICATION_EMAIL_MESSAGE, verificationRequestAccepted } from "./verificationModel";
import type { VerificationIssue } from "./verificationModel";
import type { VerificationBoot } from "./types";

function VerificationRequestSuccess({ boot }: { boot: VerificationBoot }) {
  return (
    <>
      {boot.ok === "registered" ? <div className="form-notice notice-success" role="status">{boot.verificationRequired ? "Аккаунт создан. Подтвердите почту по ссылке из письма, прежде чем войти." : "Аккаунт создан. Войдите с вашей почтой и паролем."}</div> : null}
      {boot.ok === "requested" && boot.mailMode !== "disabled" ? <div className="form-notice notice-success" role="status">{boot.mailMode === "local" ? "Если для этой почты нужно подтверждение, тестовое письмо со ссылкой сохранено локально." : "Если для этой почты нужно подтверждение, мы отправили письмо со ссылкой. Проверьте почту, в том числе папку «Спам»."}</div> : null}
    </>
  );
}

function VerificationResendHint({ boot }: { boot: VerificationBoot }) {
  if (!verificationRequestAccepted(boot)) return null;
  return <p className="recovery-mode-notice">{boot.mailMode === "local" ? "Если локального письма нет, укажите почту и запросите его ещё раз." : "Если письмо не пришло, укажите почту и запросите его ещё раз."}</p>;
}

export function VerificationForm({ boot }: { boot: VerificationBoot }) {
  const [pending, setPending] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const emailError = clientError ?? (boot.error === "email" ? VERIFICATION_EMAIL_MESSAGE : null);
  const issues: VerificationIssue[] = emailError ? [{ fieldId: "email-verification-email", message: emailError }] : [];
  const disabled = boot.mailMode === "disabled";
  const submitLabel = verificationRequestAccepted(boot) ? "Отправить ещё раз" : "Отправить письмо";

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
      setClientError(VERIFICATION_EMAIL_MESSAGE);
      emailInput.current?.focus();
      return;
    }
    setClientError(null);
    setPending(true);
  }

  return (
    <>
      <VerificationRequestSuccess boot={boot} />
      <VerificationNotice error={clientError ? "email" : boot.error} issues={issues} focusError={!clientError} />
      {boot.mailMode === "local" ? <p className="recovery-mode-notice">Тестовый режим: письмо сохраняется в .local/mail, на почту не отправляется. Откройте ссылку из этого файла, чтобы подтвердить почту.</p> : null}
      {disabled ? <VerificationUnavailable /> : null}
      <VerificationResendHint boot={boot} />
      <form method="post" action="/ui/email-verification" className="auth-form" noValidate onSubmit={submit} aria-busy={pending}>
        <input type="hidden" name="csrf_token" value={boot.csrfToken} />
        <div className="field-group">
          <label htmlFor="email-verification-email">Электронная почта</label>
          <input ref={emailInput} type="email" id="email-verification-email" name="email" defaultValue={boot.email} required autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="name@example.com" onInput={() => setClientError(null)} aria-invalid={Boolean(emailError) || undefined} aria-describedby={emailError ? "email-verification-email-error" : undefined} />
          {emailError ? <p className="field-error" id="email-verification-email-error">{emailError}</p> : null}
        </div>
        <button type="submit" className="auth-submit" disabled={pending || disabled}>{pending ? "Отправляем письмо…" : submitLabel}</button>
      </form>
    </>
  );
}
