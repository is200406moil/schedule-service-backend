import { useRef } from "react";
import { Brand } from "../../shared/Brand";
import { CookieNotice } from "../../shared/CookieNotice";
import { AuthForm } from "./AuthForm";
import { PrivacyPage } from "./PrivacyPage";
import type { PublicBoot } from "./types";
import "./public.css";

export function PublicApp({ boot }: { boot: PublicBoot }) {
  const main = useRef<HTMLElement>(null);
  return (
    <div className={`public-page${boot.page === "privacy" ? " privacy-page" : ""}`}>
      <a className="skip-link" href="#main-content">Перейти к содержимому</a>
      <header className="public-header">
        <Brand className="public-brand" />
        {boot.page === "privacy" ? <a className="header-link" href="/ui/login">Войти</a> : null}
      </header>
      <CookieNotice onDismiss={() => main.current?.focus()} />
      <main ref={main} id="main-content" className="public-main" tabIndex={-1}>
        {boot.page === "privacy" ? <PrivacyPage boot={boot} /> : <AuthForm boot={boot} />}
      </main>
      <footer className="public-footer">
        <span>Мой семестр · учебный проект</span>
        <a href="/ui/privacy">Политика конфиденциальности</a>
      </footer>
    </div>
  );
}
