import { describe, expect, it } from "vitest";
import { verificationAction, verificationErrorMessage, verificationTokenFromHash } from "./verificationModel";

const token = "aB_9-".repeat(8) + "abc";

describe("email verification credentials", () => {
  it("accepts only one exact URL-safe token fragment and never a query token", () => {
    expect(verificationTokenFromHash(`#token=${token}`)).toBe(token);
    expect(verificationAction(token)).toBe(`/ui/verify-email#token=${token}`);
    for (const hash of ["", token, `?token=${token}`, `#token=${token.slice(1)}`, `#token=${token}a`, `#token=${token}\n`, `#token=${token}&other=value`, `#other=x&token=${token}`, `#token=${token}&token=${token}`, `#token=${"a".repeat(42)}%61`, `#token=${"a".repeat(42)}+`, `#token=${"a".repeat(42)}/`, `#token=${"a".repeat(42)}=`]) {
      expect(verificationTokenFromHash(hash)).toBeNull();
    }
  });

  it.each([
    ["email", "Введите корректный адрес"],
    ["csrf", "отправить форму ещё раз"],
    ["rate", "Подождите несколько минут"],
    ["unavailable", "Попробуйте позже"],
    ["token", "Запросите новую ссылку"],
    ["unverified", "запросите новое письмо"],
  ])("gives an actionable %s error", (error, message) => {
    expect(verificationErrorMessage(error)).toContain(message);
  });
});
