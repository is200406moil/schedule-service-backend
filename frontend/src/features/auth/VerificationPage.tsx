import { EmailVerificationForm } from "./EmailVerificationForm";
import { VerificationForm } from "./VerificationForm";
import { verificationRequestAccepted } from "./verificationModel";
import type { VerificationBoot } from "./types";

export function VerificationPage({ boot }: { boot: VerificationBoot }) {
  const confirm = boot.page === "verify-email";
  const accepted = verificationRequestAccepted(boot);
  const subtitle = boot.mailMode === "disabled" ? "Вы можете войти с вашей почтой и паролем." : accepted ? (boot.mailMode === "local" ? "Если тестовое письмо уже сохранено, откройте ссылку из него и подтвердите почту." : "Если письмо уже пришло, откройте ссылку и подтвердите почту.") : confirm ? "Подтвердите почту вашего аккаунта, чтобы войти." : "Укажите почту, с которой вы зарегистрировались.";
  return (
    <section className="auth-card" aria-labelledby={`${boot.page}-title`}>
      <div className="auth-heading">
        <h1 id={`${boot.page}-title`}>{accepted ? "Проверьте почту" : "Подтверждение почты"}</h1>
        <p>{subtitle}</p>
      </div>
      {confirm ? <EmailVerificationForm boot={boot} /> : <VerificationForm boot={boot} />}
      <p className="auth-switch"><a href="/ui/login">Вернуться ко входу</a></p>
    </section>
  );
}
