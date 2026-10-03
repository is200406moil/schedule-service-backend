import { describe, expect, it } from "vitest";
import { acceptNecessaryCookies, COOKIE_NOTICE_KEY, COOKIE_NOTICE_VALUE, hasAcceptedCookies } from "./cookieNoticeModel";

describe("cookie notice preference", () => {
  it("shows on first visit and stores only a versioned non-personal choice", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(hasAcceptedCookies(storage)).toBe(false);
    acceptNecessaryCookies(storage);
    expect(hasAcceptedCookies(storage)).toBe(true);
    expect([...values]).toEqual([[COOKIE_NOTICE_KEY, COOKIE_NOTICE_VALUE]]);
  });

  it("does not confuse unrecognized choices with accepted necessary cookies", () => {
    expect(hasAcceptedCookies({ getItem: () => "v0", setItem: () => {} })).toBe(false);
  });

  it("keeps the page usable if storage is blocked", () => {
    const storage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(hasAcceptedCookies(storage)).toBe(false);
    expect(() => acceptNecessaryCookies(storage)).not.toThrow();
  });
});
