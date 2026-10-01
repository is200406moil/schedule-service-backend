import type { Ref } from "react";
import { BookOpen, CalendarClock } from "lucide-react";
import { matchingSubjects } from "./taskEditorModel";
import type { TaskEditorFields } from "./taskEditorModel";
import "./task-form.css";

type Props = {
  fields: TaskEditorFields;
  onChange: <K extends keyof TaskEditorFields>(key: K, value: TaskEditorFields[K]) => void;
  disabled: boolean;
  subjects: string[];
  titleError: string;
  dueError: string;
  titleRef: Ref<HTMLInputElement>;
  dueRef: Ref<HTMLInputElement>;
  idPrefix: string;
  autoFocus?: boolean;
  compact?: boolean;
};

export function TaskFormFields({ fields, onChange, disabled, subjects, titleError, dueError, titleRef, dueRef, idPrefix, autoFocus, compact }: Props) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const suggestions = matchingSubjects(subjects, fields.subject);

  return (
    <>
      <div className="task-editor-field">
        <label htmlFor={id("title")}>Название <span className="task-editor-required" aria-label="обязательно">*</span></label>
        <input id={id("title")} ref={titleRef} type="text" maxLength={500} autoFocus={autoFocus} required disabled={disabled} value={fields.title} onChange={(event) => onChange("title", event.target.value)} placeholder="Например, сдать лабораторную" aria-invalid={Boolean(titleError)} aria-describedby={titleError ? `${id("title-hint")} ${id("title-error")}` : id("title-hint")} />
        <p id={id("title-hint")} className="task-editor-hint">Напишите, что нужно сделать.</p>
        {titleError ? <p id={id("title-error")} className="task-editor-error" role="alert">{titleError}</p> : null}
      </div>

      <div className="task-editor-field">
        <label htmlFor={id("body")}>Описание <small>необязательно</small></label>
        <textarea id={id("body")} rows={compact ? 3 : 4} disabled={disabled} value={fields.body} onChange={(event) => onChange("body", event.target.value)} placeholder="Детали или небольшой план" />
      </div>

      <div className="task-editor-fields-row">
        <div className="task-editor-field">
          <label htmlFor={id("due")}><CalendarClock size={17} aria-hidden="true" /> Срок <small>необязательно</small></label>
          <input id={id("due")} ref={dueRef} type="datetime-local" disabled={disabled} value={fields.dueAt} onInput={(event) => onChange("dueAt", event.currentTarget.value)} onChange={(event) => onChange("dueAt", event.target.value)} aria-invalid={Boolean(dueError)} aria-describedby={dueError ? `${id("due-hint")} ${id("due-error")}` : id("due-hint")} />
          <p id={id("due-hint")} className="task-editor-hint">Московское время. Пустое поле — без срока.</p>
          {dueError ? <p id={id("due-error")} className="task-editor-error" role="alert">{dueError}</p> : null}
        </div>
        <div className="task-editor-field">
          <label htmlFor={id("subject")}><BookOpen size={17} aria-hidden="true" /> Предмет <small>необязательно</small></label>
          <input id={id("subject")} type="text" list={id("subject-options")} maxLength={255} disabled={disabled} value={fields.subject} onChange={(event) => onChange("subject", event.target.value)} placeholder="Можно выбрать или написать свой" aria-describedby={id("subject-hint")} />
          <datalist id={id("subject-options")}>{suggestions.map((name) => <option key={name} value={name} />)}</datalist>
          <p id={id("subject-hint")} className="task-editor-hint">{subjects.length ? "Подсказки из расписания группы." : "Можно написать своё название."}</p>
        </div>
      </div>
    </>
  );
}
