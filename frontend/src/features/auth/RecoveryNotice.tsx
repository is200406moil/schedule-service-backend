import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { recoveryErrorMessage } from "./recoveryModel";
import type { RecoveryIssue } from "./recoveryModel";

type Props = { error: string | null; issues: RecoveryIssue[]; requested?: boolean; localRequest?: boolean; focusIssues?: boolean };

function focusField(event: MouseEvent<HTMLAnchorElement>, fieldId: string) {
  event.preventDefault();
  document.getElementById(fieldId)?.focus();
}

export function RecoveryNotice({ error, issues, requested = false, localRequest = false, focusIssues = false }: Props) {
  const summary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) summary.current?.focus();
  }, [error]);

  useEffect(() => {
    if (focusIssues && issues.length > 1) summary.current?.focus();
  }, [focusIssues, issues]);

  return (
    <>
      {requested ? <div className="form-notice notice-success" role="status">{localRequest ? "Если аккаунт с такой почтой есть, тестовое письмо со ссылкой для смены пароля сохранено локально." : "Если аккаунт с такой почтой есть, мы отправили письмо со ссылкой для смены пароля. Проверьте почту, в том числе папку «Спам»."}</div> : null}
      {error || issues.length ? <div ref={summary} id="recovery-error" className="form-notice notice-error" role="alert" tabIndex={-1} aria-labelledby="recovery-error-title">
        <p id="recovery-error-title" className="recovery-error-title">{error ? recoveryErrorMessage(error) : "Проверьте поля ниже."}</p>
        {issues.length ? <ul className="recovery-error-links">{issues.map(issue => <li key={issue.fieldId}><a href={`#${issue.fieldId}`} onClick={event => focusField(event, issue.fieldId)}>{issue.message}</a></li>)}</ul> : null}
      </div> : null}
    </>
  );
}
