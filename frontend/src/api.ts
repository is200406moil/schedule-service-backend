import type { Schedule, Task } from "./types";

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

export async function completeTask(id: number, csrfToken: string): Promise<void> {
  const response = await fetch(`/tasks/${id}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ status: "done" }),
  });
  requireOk(response);
}
