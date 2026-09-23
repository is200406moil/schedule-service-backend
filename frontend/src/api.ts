import type { NewTask, Schedule, Task } from "./types";

export class UnauthorizedError extends Error {
  constructor() {
    super("Session expired");
    this.name = "UnauthorizedError";
  }
}

function requireOk(response: Response): void {
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", signal });
  requireOk(response);
  return (await response.json()) as T;
}

export function getTasks(signal?: AbortSignal): Promise<Task[]> {
  return getJson<Task[]>("/tasks", signal);
}

export function getSchedule(group: string, signal?: AbortSignal): Promise<Schedule> {
  return getJson<Schedule>(`/schedule/${encodeURIComponent(group)}/full_schedule`, signal);
}

export async function setTaskStatus(id: number, status: "todo" | "done", csrfToken: string): Promise<void> {
  const response = await fetch(`/tasks/${id}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ status }),
  });
  requireOk(response);
}

export function completeTask(id: number, csrfToken: string): Promise<void> {
  return setTaskStatus(id, "done", csrfToken);
}

export async function createTask(data: NewTask, csrfToken: string): Promise<Task> {
  const response = await fetch("/tasks", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify(data),
  });
  requireOk(response);
  return (await response.json()) as Task;
}
