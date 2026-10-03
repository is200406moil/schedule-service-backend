export const PASSWORD_RANGE_MESSAGE = "Пароль должен содержать от 8 до 128 символов.";
export const PASSWORD_CONFIRM_MESSAGE = "Пароли не совпадают. Введите тот же пароль ещё раз.";
export const RECOVERY_EMAIL_MESSAGE = "Введите корректный адрес электронной почты.";

const tokenFragment = /^#token=([A-Za-z0-9_-]{43})$/;

export function passwordResetTokenFromHash(hash: string): string | null {
  if (hash.length !== 50) return null;
  return tokenFragment.exec(hash)?.[1] ?? null;
}

export function readPasswordResetToken(): string | null {
  return typeof window === "undefined" ? null : passwordResetTokenFromHash(window.location.hash);
}

export function passwordResetAction(token: string): string {
  return `/ui/password-reset#token=${token}`;
}

export type RecoveryIssue = { fieldId: string; message: string };

export function passwordResetIssues(password: string, confirmation: string): RecoveryIssue[] {
  const issues: RecoveryIssue[] = [];
  const length = Array.from(password).length;
  if (length < 8 || length > 128) issues.push({ fieldId: "password-reset-password", message: PASSWORD_RANGE_MESSAGE });
  if (!confirmation || password !== confirmation) issues.push({ fieldId: "password-reset-password-confirm", message: PASSWORD_CONFIRM_MESSAGE });
  return issues;
}

export function recoveryErrorMessage(error: string): string {
  switch (error) {
    case "email": return RECOVERY_EMAIL_MESSAGE;
    case "password": return PASSWORD_RANGE_MESSAGE;
    case "password_confirm":
    case "mismatch": return PASSWORD_CONFIRM_MESSAGE;
    case "token": return "Ссылка недействительна, устарела или уже использована. Запросите новую ссылку.";
    case "csrf": return "Страница устарела. Попробуйте отправить форму ещё раз.";
    case "rate": return "Слишком много попыток. Подождите несколько минут и попробуйте снова.";
    case "unavailable": return "Сейчас не получилось отправить письмо. Попробуйте позже.";
    default: return "Проверьте введённые данные и попробуйте ещё раз.";
  }
}

export function passwordResetServerIssues(error: string | null): RecoveryIssue[] {
  if (error === "password") return [{ fieldId: "password-reset-password", message: PASSWORD_RANGE_MESSAGE }];
  if (error === "password_confirm" || error === "mismatch") return [{ fieldId: "password-reset-password-confirm", message: PASSWORD_CONFIRM_MESSAGE }];
  return [];
}
