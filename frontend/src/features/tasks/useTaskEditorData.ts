import { useEffect, useState } from "react";
import { ApiError, getSchedule, getTask, UnauthorizedError } from "../../shared/api";
import { blankTaskFields, fieldsFromTask, subjectNames } from "./taskEditorModel";
import type { TaskEditorFields } from "./taskEditorModel";
import type { TaskEditorBootData } from "../../shared/types";

export type TaskEditorData =
  | { kind: "ready"; fields: TaskEditorFields }
  | { kind: "loading" | "missing" | "error" | "session-expired" };

export function useTaskEditorData({ taskId, initialSubject, group }: TaskEditorBootData) {
  const [task, setTask] = useState<TaskEditorData>(() => taskId === null
    ? { kind: "ready", fields: blankTaskFields(initialSubject ?? "") }
    : { kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [subjects, setSubjects] = useState<string[]>([]);

  useEffect(() => {
    if (taskId === null) return;
    const controller = new AbortController();
    setTask({ kind: "loading" });
    getTask(taskId, controller.signal)
      .then((value) => {
        const fields = fieldsFromTask(value);
        if (initialSubject?.trim()) fields.subject = initialSubject;
        setTask({ kind: "ready", fields });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof UnauthorizedError) setTask({ kind: "session-expired" });
        else setTask({ kind: error instanceof ApiError && error.status === 404 ? "missing" : "error" });
      });
    return () => controller.abort();
  }, [taskId, initialSubject, attempt]);

  useEffect(() => {
    if (!group) return;
    const controller = new AbortController();
    getSchedule(group, controller.signal)
      .then((schedule) => setSubjects(subjectNames(schedule)))
      .catch(() => { /* The field remains free text when the schedule is unavailable. */ });
    return () => controller.abort();
  }, [group]);

  return {
    task,
    subjects,
    retry: () => setAttempt(value => value + 1),
    markMissing: () => setTask({ kind: "missing" }),
  };
}
