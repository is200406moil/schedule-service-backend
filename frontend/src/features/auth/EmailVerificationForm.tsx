import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { VerificationNotice, VerificationUnavailable } from "./VerificationNotice";
import { readVerificationToken, verificationAction } from "./verificationModel";
import type { VerificationBoot } from "./types";

export function RequestNewVerificationLink() {
  return <a className="auth-submit recovery-request-link" href="/ui/email-verification">Запросить новую ссылку</a>;
}

export function EmailVerificationForm({ boot }: { boot: VerificationBoot }) {
  const [token, setToken] = useState(readVerificationToken);
  const [pending, setPending] = useState(false);
  const tokenInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const readFragment = () => setToken(readVerificationToken());
    const restorePage = () => { readFragment(); setPending(false); };
    window.addEventListener("hashchange", readFragment);
    window.addEventListener("pageshow", restorePage);
    return () => {
      window.removeEventListener("hashchange", readFragment);
      window.removeEventListener("pageshow", restorePage);
    };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    if (pending) {
      event.preventDefault();
      return;
    }
    const currentToken = readVerificationToken();
    if (!currentToken) {
      event.preventDefault();
      setToken(null);
      return;
    }
    if (tokenInput.current) tokenInput.current.value = currentToken;
    event.currentTarget.setAttribute("action", verificationAction(currentToken));
    setToken(currentToken);
    setPending(true);
  }

  if (!token || boot.error === "token") return <><VerificationNotice error="token" />{boot.mailMode === "disabled" ? <VerificationUnavailable /> : null}<RequestNewVerificationLink /></>;

  return (
    <>
      <VerificationNotice error={boot.error} />
      <form method="post" action={verificationAction(token)} className="auth-form" onSubmit={submit} aria-busy={pending}>
        <input type="hidden" name="csrf_token" value={boot.csrfToken} />
        <input ref={tokenInput} type="hidden" name="token" defaultValue={token} />
        <button type="submit" className="auth-submit" disabled={pending}>{pending ? "Подтверждаем почту…" : "Подтвердить почту"}</button>
      </form>
    </>
  );
}
