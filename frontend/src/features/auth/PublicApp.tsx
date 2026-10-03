import { useRef } from "react";
import { Brand } from "../../shared/Brand";
import { CookieNotice } from "../../shared/CookieNotice";
import { AuthForm } from "./AuthForm";
import { PrivacyPage } from "./PrivacyPage";
import { RecoveryPage } from "./RecoveryPage";
import { VerificationPage } from "./VerificationPage";
import type { PublicBoot } from "./types";
import "./public.css";

function PublicContent({ boot }: { boot: PublicBoot }) {
  if (boot.page === "privacy") return <PrivacyPage boot={boot} />;
  if (boot.page === "forgot-password" || boot.page === "password-reset") return <RecoveryPage boot={boot} />;
  if (boot.page === "email-verification" || boot.page === "verify-email") return <VerificationPage boot={boot} />;
  if (boot.page === "login" || boot.page === "register") return <AuthForm boot={boot} />;
  return null;
}

export function PublicApp({ boot }: { boot: PublicBoot }) {
  const main = useRef<HTMLElement>(null);
  const secretFragment = boot.page === "password-reset" || boot.page === "verify-email";
  return (
    <div className={`public-page${boot.page === "privacy" ? " privacy-page" : ""}`}>
      <a className="skip-link" href="#main-content" onClick={secretFragment ? event => { event.preventDefault(); main.current?.focus(); } : undefined}>Перейти к содержимому</a>
      <header className="public-header">
        <Brand className="public-brand" />
        {boot.page === "privacy" ? <a className="header-link" href="/ui/login">Войти</a> : null}
      </header>
      <CookieNotice onDismiss={() => main.current?.focus()} />
      <main ref={main} id="main-content" className="public-main" tabIndex={-1}>
        <PublicContent boot={boot} />
      </main>
      <footer className="public-footer">
        <span>Мой семестр · учебный проект</span>
        <a href="/ui/privacy">Политика конфиденциальности</a>
      </footer>
    </div>
  );
}
