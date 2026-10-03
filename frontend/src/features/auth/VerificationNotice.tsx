import { useEffect, useRef } from "react";
import { verificationErrorMessage } from "./verificationModel";
import type { VerificationIssue } from "./verificationModel";

type Props = { error: string | null; issues?: VerificationIssue[]; focusError?: boolean };

export function VerificationUnavailable() {
  return <p className="recovery-mode-notice">Новое письмо пока нельзя запросить: отправка писем не настроена. В этой версии можно войти без подтверждения.</p>;
}

export function VerificationNotice({ error, issues = [], focusError = true }: Props) {
  const summary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error && focusError) summary.current?.focus();
  }, [error, focusError]);

  if (!error && !issues.length) return null;

  return (
    <div ref={summary} id="verification-error" className="form-notice notice-error" role="alert" tabIndex={-1} aria-labelledby="verification-error-title">
      <p id="verification-error-title" className="recovery-error-title">{error ? verificationErrorMessage(error) : "Проверьте поля ниже."}</p>
      {issues.length ? <ul className="recovery-error-links">{issues.map(issue => <li key={issue.fieldId}><a href={`#${issue.fieldId}`} onClick={event => { event.preventDefault(); document.getElementById(issue.fieldId)?.focus(); }}>{issue.message}</a></li>)}</ul> : null}
    </div>
  );
}
