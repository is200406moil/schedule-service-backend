import { useEffect, useRef, useState } from "react";
import { GraduationCap } from "lucide-react";
import { ApiError, getGroups, UnauthorizedError } from "../../shared/api";
import { fieldsFromProfile, matchingGroups } from "./profileModel";
import type { ProfileFields } from "./profileModel";
import type { UserProfile } from "../../shared/types";
import "../../shared/form-fields.css";

type Props = {
  profile: UserProfile;
  busy: boolean;
  saving: boolean;
  onSave: (fields: ProfileFields) => Promise<UserProfile>;
  onCancel?: () => void;
  onSaved?: () => void;
};

export function ProfileDetailsForm({ profile, busy, saving, onSave, onCancel, onSaved }: Props) {
  const { first_name, last_name, patronymic, birth_date, group_name } = profile;
  const [fields, setFields] = useState(() => fieldsFromProfile(profile));
  const [groups, setGroups] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState(false);
  const [groupRetry, setGroupRetry] = useState(0);
  const [groupError, setGroupError] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [dateError, setDateError] = useState("");
  const dateInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const baseline = fieldsFromProfile(profile);
  const dirty = (Object.keys(fields) as Array<keyof ProfileFields>).some((key) => fields[key] !== baseline[key]);

  useEffect(() => {
    // Photo changes must not replace an unsaved details draft.
    setFields(fieldsFromProfile({ first_name, last_name, patronymic, birth_date, group_name }));
  }, [first_name, last_name, patronymic, birth_date, group_name]);

  useEffect(() => {
    if (!groupSearch) return;
    const controller = new AbortController();
    setGroupError(false);
    getGroups(controller.signal)
      .then((data) => setGroups(data.groups))
      .catch(() => { if (!controller.signal.aborted) setGroupError(true); });
    return () => controller.abort();
  }, [groupSearch, groupRetry]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(key: keyof ProfileFields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setSaveError("");
    if (key === "birthDate") setDateError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitting.current || !dirty) return;
    if (dateInput.current && !dateInput.current.validity.valid) {
      setDateError("Проверьте дату рождения.");
      dateInput.current.focus();
      return;
    }
    submitting.current = true;
    setSaveError("");
    try {
      const saved = await onSave(fields);
      setFields(fieldsFromProfile(saved));
      onSaved?.();
    } catch (error) {
      if (error instanceof UnauthorizedError) return;
      if (error instanceof ApiError && error.status === 403) setSaveError("Не удалось подтвердить запрос. Обновите страницу и повторите.");
      else if (error instanceof ApiError && error.status === 422) setSaveError("Проверьте дату и длину заполненных полей.");
      else setSaveError("Не удалось сохранить данные. Попробуйте ещё раз.");
    } finally { submitting.current = false; }
  }

  const suggestions = matchingGroups(groups, fields.group);

  return (
    <section className="profile-details" aria-labelledby="profile-details-heading">
      <header><h2 id="profile-details-heading">Личные данные</h2><p>Заполните только то, что хотите сохранить в профиле.</p></header>
      <form onSubmit={submit} noValidate aria-busy={saving}>
        <div className="profile-fields-row">
          <div className="form-field"><label htmlFor="profile-last-name">Фамилия</label><input id="profile-last-name" autoComplete="family-name" maxLength={120} disabled={busy} value={fields.lastName} onChange={(event) => change("lastName", event.target.value)} /></div>
          <div className="form-field"><label htmlFor="profile-first-name">Имя</label><input id="profile-first-name" autoComplete="given-name" maxLength={120} disabled={busy} value={fields.firstName} onChange={(event) => change("firstName", event.target.value)} /></div>
        </div>
        <div className="profile-fields-row">
          <div className="form-field"><label htmlFor="profile-patronymic">Отчество</label><input id="profile-patronymic" autoComplete="additional-name" maxLength={120} disabled={busy} value={fields.patronymic} onChange={(event) => change("patronymic", event.target.value)} /></div>
          <div className="form-field"><label htmlFor="profile-birth-date">Дата рождения</label><input ref={dateInput} id="profile-birth-date" type="date" autoComplete="bday" min="0001-01-01" max="9999-12-31" disabled={busy} value={fields.birthDate} onInput={(event) => change("birthDate", event.currentTarget.value)} onChange={(event) => change("birthDate", event.target.value)} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? "profile-date-error" : undefined} />{dateError ? <p id="profile-date-error" className="form-field-error" role="alert">{dateError}</p> : null}</div>
        </div>
        <div className="form-field"><label htmlFor="profile-group"><GraduationCap size={18} aria-hidden="true" /> Учебная группа</label><input id="profile-group" list="profile-group-options" autoComplete="off" maxLength={64} disabled={busy} value={fields.group} placeholder="Например, ИКБО-14-23" onFocus={() => setGroupSearch(true)} onChange={(event) => change("group", event.target.value)} aria-describedby="profile-group-hint" /><datalist id="profile-group-options">{suggestions.map((group) => <option key={group} value={group} />)}</datalist><p id="profile-group-hint" className="form-field-hint">{groupError ? "Подсказки не загрузились. Группу можно ввести вручную." : "После сохранения расписание будет загружаться для этой группы."}</p>{groupError ? <button className="profile-text-button" type="button" onClick={() => setGroupRetry((value) => value + 1)}>Повторить загрузку подсказок</button> : null}</div>
        {saveError ? <p className="profile-form-error" role="alert">{saveError}</p> : null}
        <div className="profile-form-actions"><span>{dirty ? "Изменения не сохранены" : ""}</span><div><button className="profile-secondary-button" type="button" disabled={busy} onClick={() => { setFields(baseline); setSaveError(""); setDateError(""); onCancel?.(); }}>Отмена</button><button className="profile-save-button" type="submit" disabled={busy || !dirty}>{saving ? "Сохраняем…" : "Сохранить изменения"}</button></div></div>
      </form>
    </section>
  );
}
