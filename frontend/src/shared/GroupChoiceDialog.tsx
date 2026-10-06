import { useEffect, useRef, useState } from "react";
import { ApiError, getGroups, UnauthorizedError, updateProfile } from "./api";
import "./form-fields.css";
import "./group-choice-dialog.css";

type Props = {
  csrfToken: string;
  onLater: () => void;
  onSaved: () => void;
};

export function GroupChoiceDialog({ csrfToken, onLater, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(false);
  const submitting = useRef(false);
  const [group, setGroup] = useState("");
  const [groups, setGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const current = dialog.current;
    active.current = true;
    if (!current?.open) current?.showModal();
    input.current?.focus();
    return () => {
      active.current = false;
      if (current?.open) current.close();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    getGroups(controller.signal)
      .then((data) => { if (!controller.signal.aborted) setGroups(data.groups); })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || sessionExpired) return;
    const value = group.trim();
    if (!value || value.length > 64) {
      setError(value ? "Название группы должно быть не длиннее 64 символов." : "Введите или выберите учебную группу.");
      input.current?.focus();
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      await updateProfile({ group_name: value }, csrfToken);
      if (active.current) onSaved();
    } catch (failure) {
      if (!active.current) return;
      if (failure instanceof UnauthorizedError) {
        setSessionExpired(true);
        setError("Сеанс завершился. Войдите снова, чтобы сохранить группу.");
      } else if (failure instanceof ApiError && failure.status === 403) {
        setError("Не удалось подтвердить запрос. Обновите страницу и повторите.");
      } else if (failure instanceof ApiError && failure.status === 422) {
        setError("Проверьте название группы и попробуйте ещё раз.");
      } else setError("Не удалось сохранить группу. Попробуйте ещё раз.");
    } finally {
      submitting.current = false;
      if (active.current) setSaving(false);
    }
  }

  const query = group.trim().toLocaleUpperCase("ru");
  const suggestions = groups.filter((name) => name.toLocaleUpperCase("ru").includes(query)).slice(0, 8);

  return (
    <dialog ref={dialog} className="group-choice-dialog" aria-labelledby="group-choice-title" aria-describedby="group-choice-description" aria-busy={saving}
      onCancel={(event) => { event.preventDefault(); if (!submitting.current) dialog.current?.close(); }}
      onClose={(event) => { if (active.current && !event.currentTarget.open) onLater(); }}>
      <h2 id="group-choice-title">Выберите учебную группу</h2>
      <p id="group-choice-description">Покажем ваше расписание рядом с задачами. Группу можно выбрать позже или изменить в профиле.</p>
      <form onSubmit={save} noValidate>
        <div className="form-field">
          <label htmlFor="group-choice-input">Учебная группа</label>
          <input ref={input} id="group-choice-input" list="group-choice-options" value={group} autoComplete="off" maxLength={64} placeholder="Например, ИКБО-14-23" disabled={saving || sessionExpired}
            aria-invalid={Boolean(error)} aria-describedby={error ? "group-choice-hint group-choice-error" : "group-choice-hint"}
            onChange={(event) => { setGroup(event.target.value); setError(""); }} />
          <datalist id="group-choice-options">{suggestions.map((name) => <option key={name} value={name} />)}</datalist>
          <p id="group-choice-hint" className="form-field-hint" role="status">{loading ? "Загружаем подсказки…" : loadError ? "Подсказки не загрузились. Группу можно ввести вручную." : "Начните вводить название и выберите группу из подсказок."}</p>
          {loadError ? <button className="group-choice-retry" type="button" disabled={loading || saving} onClick={() => setRetry((value) => value + 1)}>Повторить загрузку подсказок</button> : null}
          {error ? <p id="group-choice-error" className="form-field-error" role="alert">{error}</p> : null}
          {sessionExpired ? <a href="/ui/login">Войти снова</a> : null}
        </div>
        <div className="group-choice-actions">
          <button type="button" className="group-choice-later" disabled={saving} onClick={() => { if (!submitting.current) dialog.current?.close(); }}>Выбрать позже</button>
          <button type="submit" className="group-choice-save" disabled={saving || sessionExpired}>{saving ? "Сохраняем…" : "Сохранить группу"}</button>
        </div>
      </form>
    </dialog>
  );
}
