import { useSyncExternalStore } from "react";
import { PasswordResetForm, RequestNewRecoveryLink } from "./PasswordResetForm";
import { RecoveryForm } from "./RecoveryForm";
import { RecoveryNotice } from "./RecoveryNotice";
import { readPasswordResetToken } from "./recoveryModel";
import type { RecoveryBoot } from "./types";

function subscribeToFragment(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("pageshow", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("pageshow", onChange);
  };
}

function noServerToken() { return null; }

function PasswordResetContent({ boot }: { boot: RecoveryBoot }) {
  const token = useSyncExternalStore(subscribeToFragment, readPasswordResetToken, noServerToken);
  if (!token || boot.error === "token") return <><RecoveryNotice error="token" issues={[]} /><RequestNewRecoveryLink /></>;
  return <PasswordResetForm boot={boot} token={token} />;
}

export function RecoveryPage({ boot }: { boot: RecoveryBoot }) {
  const reset = boot.page === "password-reset";
  return (
    <section className="auth-card" aria-labelledby={`${boot.page}-title`}>
      <div className="auth-heading">
        <h1 id={`${boot.page}-title`}>{reset ? "Новый пароль" : "Восстановление пароля"}</h1>
        <p>{reset ? "Введите новый пароль для вашего аккаунта." : "Укажите почту, с которой вы зарегистрировались."}</p>
      </div>
      {reset ? <PasswordResetContent boot={boot} /> : <RecoveryForm boot={boot} />}
      <p className="auth-switch"><a href="/ui/login">Вернуться ко входу</a></p>
    </section>
  );
}
