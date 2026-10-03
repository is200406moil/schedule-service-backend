import { describe, expect, it } from "vitest";
import { passwordResetAction, passwordResetIssues, passwordResetTokenFromHash } from "./recoveryModel";

const token = "aB_9-".repeat(8) + "abc";

describe("password recovery credentials", () => {
  it("accepts only one exact URL-safe token fragment and never a query token", () => {
    expect(passwordResetTokenFromHash(`#token=${token}`)).toBe(token);
    expect(passwordResetAction(token)).toBe(`/ui/password-reset#token=${token}`);
    for (const hash of ["", token, `?token=${token}`, `#token=${token.slice(1)}`, `#token=${token}a`, `#token=${token}\n`, `#token=${token}&other=value`, `#other=x&token=${token}`, `#token=${token}&token=${token}`, `#token=${"a".repeat(42)}%61`, `#token=${"a".repeat(42)}+`, `#token=${"a".repeat(42)}/`]) {
      expect(passwordResetTokenFromHash(hash)).toBeNull();
    }
  });

  const emoji = String.fromCodePoint(0x1f600);
  it.each([
    ["four emoji", emoji.repeat(4), false],
    ["eight emoji", emoji.repeat(8), true],
    ["65 emoji", emoji.repeat(65), true],
    ["128 emoji", emoji.repeat(128), true],
    ["129 emoji", emoji.repeat(129), false],
    ["seven mixed characters", `abcDE${emoji.repeat(2)}`, false],
    ["eight mixed characters", `abcDEF${emoji.repeat(2)}`, true],
    ["128 ASCII", "a".repeat(128), true],
    ["129 ASCII", "a".repeat(129), false],
  ])("matches the server code-point range for %s", (_name, password, valid) => {
    expect(passwordResetIssues(password, password).length === 0).toBe(valid);
  });

  it("rejects an empty confirmation and compares exact password values", () => {
    for (const confirmation of ["", "different-password", " password ", "Password"])
      expect(passwordResetIssues("password", confirmation).map(issue => issue.fieldId)).toContain("password-reset-password-confirm");
    expect(passwordResetIssues(" password ", " password ")).toEqual([]);
  });
});
