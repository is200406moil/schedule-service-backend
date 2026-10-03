import { useState } from "react";
import { acceptNecessaryCookies, hasAcceptedCookies } from "./cookieNoticeModel";
import "./cookie-notice.css";

export function CookieNotice({ onDismiss }: { onDismiss?: () => void } = {}) {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return !hasAcceptedCookies(window.localStorage);
    } catch {
      return true;
    }
  });

  if (!visible) return null;

  function accept() {
    try {
      acceptNecessaryCookies(window.localStorage);
    } catch {
      // Some browser modes deny even access to localStorage.
    }
    setVisible(false);
    onDismiss?.();
  }

  return (
    <aside className="cookie-notice" aria-labelledby="cookie-notice-title">
      <div>
        <h2 id="cookie-notice-title">Только нужные cookies</h2>
        <p>Они нужны для входа и защиты форм. Рекламных cookies нет. <a href="/ui/privacy#privacy-cookies">Подробнее</a></p>
      </div>
      <button type="button" onClick={accept}>Принять необходимые</button>
    </aside>
  );
}
