import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { UnauthorizedError } from "./api";
import { formatDate } from "./dates";
import type { NewTask } from "./types";

type Props = {
  open: boolean;
  date: string;
  preset: { subject: string; time: string } | null;
  onClose: () => void;
  onCreate: (data: NewTask) => Promise<void>;
};

export function QuickTaskDialog({ open, date, preset, onClose, onCreate }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [time, setTime] = useState("18:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      if (dialog.current?.open) dialog.current.close();
      return;
    }
    setTitle("");
    setBody("");
    setSubject(preset?.subject ?? "");
    setTime(preset?.time ?? "18:00");
    setError("");
    if (!dialog.current?.open) dialog.current?.showModal();
    titleInput.current?.focus();
  }, [open, date, preset]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Напишите название задачи.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onCreate({
        title: title.trim(),
        body: body.trim() || null,
        subject: subject.trim() || null,
        due_at: `${date}T${time}`,
      });
      dialog.current?.close();
    } catch (cause) {
      if (!(cause instanceof UnauthorizedError)) setError("Не удалось сохранить задачу. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog className="quick-task-dialog" ref={dialog} onClose={onClose} aria-labelledby="quick-task-title">
      <div className="quick-task-head">
        <div>
          <p>Быстрое добавление</p>
          <h2 id="quick-task-title">Новая задача</h2>
        </div>
        <button type="button" className="quick-task-close" onClick={() => dialog.current?.close()} aria-label="Закрыть окно"><X size={19} aria-hidden="true" /></button>
      </div>
      <p className="quick-task-date">{formatDate(date, { weekday: "long", day: "numeric", month: "long" })}</p>
      <form onSubmit={submit}>
        <label htmlFor="quick-task-name">Название <span aria-hidden="true">*</span></label>
        <input id="quick-task-name" ref={titleInput} required maxLength={500} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, сдать лабораторную" />

        <div className="quick-task-two">
          <div>
            <label htmlFor="quick-task-time">Срок <span aria-hidden="true">*</span></label>
            <input id="quick-task-time" type="time" required value={time} onChange={(event) => setTime(event.target.value)} />
          </div>
          <div>
            <label htmlFor="quick-task-subject">Предмет <small>необязательно</small></label>
            <input id="quick-task-subject" maxLength={255} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Название предмета" />
          </div>
        </div>

        <label htmlFor="quick-task-body">Описание <small>необязательно</small></label>
        <textarea id="quick-task-body" rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Что нужно сделать?" />
        {error ? <p className="quick-task-error" role="alert">{error}</p> : null}
        <div className="quick-task-actions">
          <button type="button" className="quick-task-cancel" onClick={() => dialog.current?.close()}>Отмена</button>
          <button type="submit" className="quick-task-save" disabled={saving}>{saving ? "Сохраняем…" : "Создать задачу"}</button>
        </div>
      </form>
    </dialog>
  );
}
