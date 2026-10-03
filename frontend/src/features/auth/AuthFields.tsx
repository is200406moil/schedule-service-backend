import { useState } from "react";
import type { RefObject } from "react";
import type { AuthBoot } from "./types";

type FieldProps = Pick<AuthBoot, "page" | "error">;

export function AuthEmailField({ page, email, error }: FieldProps & Pick<AuthBoot, "email">) {
  const invalid = ["email", "auth", "exists"].includes(error || "");
  const id = `${page}-email`;

  return (
    <div className="field-group">
      <label htmlFor={id}>Электронная почта</label>
      <input type="text" id={id} name="email" defaultValue={email} required autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="name@example.com" aria-invalid={invalid || undefined} aria-describedby={invalid ? "auth-error" : undefined} />
    </div>
  );
}

type PasswordProps = FieldProps & {
  inputRef: RefObject<HTMLInputElement | null>;
  clientError: string | null;
  onInput: () => void;
};

export function AuthPasswordField({ page, error, inputRef, clientError, onInput }: PasswordProps) {
  const [visible, setVisible] = useState(false);
  const registration = page === "register";
  const serverInvalid = ["password", "auth"].includes(error || "");
  const invalid = Boolean(clientError) || serverInvalid;
  const id = `${page}-password`;
  const errorId = `${id}-error`;
  const describedBy = [registration ? "password-hint" : "", clientError ? errorId : (serverInvalid ? "auth-error" : "")].filter(Boolean).join(" ") || undefined;

  return (
    <div className="field-group">
      <label htmlFor={id}>Пароль</label>
      <div className="password-field">
        <input ref={inputRef} type={visible ? "text" : "password"} id={id} name="password" required autoComplete={registration ? "new-password" : "current-password"} onInput={onInput} aria-invalid={invalid || undefined} aria-describedby={describedBy} />
        <button className="password-toggle" type="button" onClick={() => setVisible(value => !value)} aria-controls={id} aria-label={visible ? "Скрыть пароль" : "Показать пароль"} aria-pressed={visible}>{visible ? "Скрыть" : "Показать"}</button>
      </div>
      {registration ? <p className="field-hint" id="password-hint">От 8 до 128 символов.</p> : null}
      {clientError ? <p className="field-error" id={errorId} role="alert">{clientError}</p> : null}
    </div>
  );
}
