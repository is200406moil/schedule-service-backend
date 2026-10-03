export type BootData = {
  firstName: string;
  group: string;
  avatar: string;
  today: string;
  csrfToken: string;
};

export type CalendarBootData = BootData & {
  initialDate: string | null;
  initialLesson: string | null;
};

export type TasksBootData = BootData & {
  initialFilter: string | null;
};

export type TaskEditorBootData = BootData & {
  taskId: number | null;
  returnTo: string;
  initialSubject: string | null;
};

export type UserProfile = {
  id: number;
  email: string;
  is_active: boolean;
  first_name: string | null;
  last_name: string | null;
  patronymic: string | null;
  birth_date: string | null;
  group_name: string | null;
  avatar_base64: string | null;
};

export type ProfileBootData = BootData & {
  profile: UserProfile;
  initialEdit: boolean;
};

export type ProfileUpdate = Partial<Pick<UserProfile,
  "first_name" | "last_name" | "patronymic" | "birth_date" | "group_name" | "avatar_base64"
>>;

export type GroupsListResponse = {
  count: number;
  groups: string[];
};

export type NewTask = {
  title: string;
  body: string | null;
  subject: string | null;
  due_at: string | null;
};

export type TaskEditPayload = NewTask & {
  status: "todo" | "done";
};

export type Task = {
  id: number;
  title: string;
  body: string | null;
  subject: string | null;
  status: "todo" | "done";
  due_at: string | null;
  created_at: string;
  updated_at: string;
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
