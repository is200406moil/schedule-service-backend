export type BootData = {
  firstName: string;
  group: string;
  avatar: string;
  today: string;
  csrfToken: string;
};

export type Task = {
  id: number;
  title: string;
  body: string | null;
  subject: string | null;
  status: "todo" | "done";
  due_at: string | null;
};

export type Lesson = {
  name: string;
  weeks: number[];
  time_start: string;
  time_end: string;
  types: string;
  teachers: string[];
  rooms: string[];
};

export type Schedule = {
  group: string;
  schedule: Record<string, { lessons: Lesson[][] }>;
};

export type Loadable<T> =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; data: T };
