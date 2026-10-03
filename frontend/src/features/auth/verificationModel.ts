import { passwordResetTokenFromHash, RECOVERY_EMAIL_MESSAGE } from "./recoveryModel";
import type { VerificationBoot } from "./types";

export const VERIFICATION_EMAIL_MESSAGE = RECOVERY_EMAIL_MESSAGE;

export function verificationTokenFromHash(hash: string): string | null {
  return passwordResetTokenFromHash(hash);
}

export function readVerificationToken(): string | null {
  return typeof window === "undefined" ? null : verificationTokenFromHash(window.location.hash);
}

export function verificationAction(token: string): string {
  return `/ui/verify-email#token=${token}`;
}

export type VerificationIssue = { fieldId: string; message: string };

export function verificationRequestAccepted(boot: VerificationBoot): boolean {
  return boot.page === "email-verification" && boot.mailMode !== "disabled" && (boot.ok === "registered" || boot.ok === "requested");
}

export function verificationErrorMessage(error: string): string {
  switch (error) {
    case "email": return VERIFICATION_EMAIL_MESSAGE;
    case "csrf": return "Страница устарела. Попробуйте отправить форму ещё раз.";
    case "rate": return "Слишком много попыток. Подождите несколько минут и попробуйте снова.";
    case "unavailable": return "Сейчас не получилось отправить письмо. Попробуйте позже.";
    case "token": return "Ссылка недействительна, устарела или уже использована. Запросите новую ссылку.";
    case "unverified": return "Чтобы войти, подтвердите почту. Откройте ссылку из письма или запросите новое письмо ниже.";
    default: return "Проверьте введённые данные и попробуйте ещё раз.";
  }
}
