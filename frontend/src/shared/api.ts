import type { GroupsListResponse, NewTask, ProfileUpdate, Schedule, Task, TaskEditPayload, UserProfile } from "./types";

export class UnauthorizedError extends Error {
  constructor() {
    super("Session expired");
    this.name = "UnauthorizedError";
  }
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Request failed: ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

function requireOk(response: Response): void {
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new ApiError(response.status);
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", signal });
  requireOk(response);
  return (await response.json()) as T;
}

export function getTasks(signal?: AbortSignal): Promise<Task[]> {
  return getJson<Task[]>("/tasks", signal);
}

export function getTask(id: number, signal?: AbortSignal): Promise<Task> {
  return getJson<Task>(`/tasks/${id}`, signal);
}

export function getSchedule(group: string, signal?: AbortSignal): Promise<Schedule> {
  return getJson<Schedule>(`/schedule/${encodeURIComponent(group)}/full_schedule`, signal);
}

export function getProfile(signal?: AbortSignal): Promise<UserProfile> {
  return getJson<UserProfile>("/auth/me", signal);
}

export function getGroups(signal?: AbortSignal): Promise<GroupsListResponse> {
  return getJson<GroupsListResponse>("/schedule/groups", signal);
}

export async function updateProfile(data: ProfileUpdate, csrfToken: string): Promise<UserProfile> {
  const response = await fetch("/auth/me", {
    method: "PATCH",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify(data),
  });
  requireOk(response);
  return (await response.json()) as UserProfile;
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

export async function deleteTask(id: number, csrfToken: string): Promise<void> {
  const response = await fetch(`/tasks/${id}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "X-CSRF-Token": csrfToken },
  });
  requireOk(response);
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

export async function updateTask(id: number, data: Partial<TaskEditPayload>, csrfToken: string): Promise<Task> {
  const response = await fetch(`/tasks/${id}`, {
    method: "PATCH",
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
