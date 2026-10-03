import { useEffect, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import { RecoveryNotice } from "./RecoveryNotice";
import { passwordResetAction, passwordResetIssues, passwordResetServerIssues, readPasswordResetToken } from "./recoveryModel";
import type { RecoveryIssue } from "./recoveryModel";
import type { RecoveryBoot } from "./types";

type PasswordFieldProps = {
  id: string;
  name: string;
  label: string;
  inputRef: RefObject<HTMLInputElement | null>;
  error: string | null;
  hint?: boolean;
  onInput: () => void;
};

function ResetPasswordField({ id, name, label, inputRef, error, hint = false, onInput }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  const describedBy = [hint ? "password-reset-hint" : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;

  return (
    <div className="field-group">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input ref={inputRef} type={visible ? "text" : "password"} id={id} name={name} required autoComplete="new-password" onInput={onInput} aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy} />
        <button className="password-toggle" type="button" onClick={() => setVisible(value => !value)} aria-controls={id} aria-label={visible ? `Скрыть: ${label.toLowerCase()}` : `Показать: ${label.toLowerCase()}`} aria-pressed={visible}>{visible ? "Скрыть" : "Показать"}</button>
      </div>
      {hint ? <p className="field-hint" id="password-reset-hint">От 8 до 128 символов.</p> : null}
      {error ? <p className="field-error" id={errorId}>{error}</p> : null}
    </div>
  );
}

export function RequestNewRecoveryLink() {
  return <a className="auth-submit recovery-request-link" href="/ui/forgot-password">Запросить новую ссылку</a>;
}

export function PasswordResetForm({ boot, token }: { boot: RecoveryBoot; token: string }) {
  const [pending, setPending] = useState(false);
  const [clientIssues, setClientIssues] = useState<RecoveryIssue[] | null>(null);
  const [invalidToken, setInvalidToken] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const tokenInput = useRef<HTMLInputElement>(null);
  const fragmentToken = readPasswordResetToken();
  const formToken = fragmentToken ?? token;
  const issues = clientIssues ?? passwordResetServerIssues(boot.error);
  const passwordError = issues.find(issue => issue.fieldId === "password-reset-password")?.message ?? null;
  const confirmationError = issues.find(issue => issue.fieldId === "password-reset-password-confirm")?.message ?? null;

  useEffect(() => {
    const resetPending = () => setPending(false);
    window.addEventListener("pageshow", resetPending);
    return () => window.removeEventListener("pageshow", resetPending);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    if (pending) {
      event.preventDefault();
      return;
    }
    const currentToken = readPasswordResetToken();
    if (!currentToken) {
      event.preventDefault();
      setInvalidToken(true);
      return;
    }
    const nextIssues = passwordResetIssues(passwordInput.current?.value ?? "", confirmationInput.current?.value ?? "");
    setClientIssues(nextIssues);
    if (nextIssues.length) {
      event.preventDefault();
      if (nextIssues.length === 1) document.getElementById(nextIssues[0].fieldId)?.focus();
      return;
    }
    if (tokenInput.current) tokenInput.current.value = currentToken;
    event.currentTarget.setAttribute("action", passwordResetAction(currentToken));
    setPending(true);
  }

  if (invalidToken && !fragmentToken) return <><RecoveryNotice error="token" issues={[]} /><RequestNewRecoveryLink /></>;

  return (
    <>
      <RecoveryNotice error={boot.error} issues={issues} focusIssues={clientIssues !== null} />
      <form method="post" action={passwordResetAction(formToken)} className="auth-form" onSubmit={submit} aria-busy={pending}>
        <input type="hidden" name="csrf_token" value={boot.csrfToken} />
        <input ref={tokenInput} type="hidden" name="token" defaultValue={formToken} />
        <ResetPasswordField id="password-reset-password" name="password" label="Новый пароль" inputRef={passwordInput} error={passwordError} hint onInput={() => setClientIssues([])} />
        <ResetPasswordField id="password-reset-password-confirm" name="password_confirm" label="Повторите новый пароль" inputRef={confirmationInput} error={confirmationError} onInput={() => setClientIssues([])} />
        <button type="submit" className="auth-submit" disabled={pending}>{pending ? "Сохраняем пароль…" : "Сохранить пароль"}</button>
      </form>
    </>
  );
}
