export const COOKIE_NOTICE_KEY = "my-semester:cookie-notice:v1";
export const COOKIE_NOTICE_VALUE = "necessary";

type NoticeStorage = Pick<Storage, "getItem" | "setItem">;

export function hasAcceptedCookies(storage: NoticeStorage): boolean {
  try {
    return storage.getItem(COOKIE_NOTICE_KEY) === COOKIE_NOTICE_VALUE;
  } catch {
    return false;
  }
}

export function acceptNecessaryCookies(storage: NoticeStorage): void {
  try {
    storage.setItem(COOKIE_NOTICE_KEY, COOKIE_NOTICE_VALUE);
  } catch {
    // Closing the notice still works if browser storage is unavailable.
  }
}
