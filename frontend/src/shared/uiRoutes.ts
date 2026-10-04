export const uiRoutes = {
  overview: "/ui",
  calendar: "/ui/calendar",
  tasks: "/ui/tasks",
  profile: "/ui/profile",
  profileEdit: "/ui/profile?edit=1",
  taskNew: "/ui/tasks/new",
} as const;

export function calendarHref(date: string): string {
  return `${uiRoutes.calendar}?date=${encodeURIComponent(date)}`;
}

export function taskListHref(filter = "all"): string {
  return filter === "all" ? uiRoutes.tasks : `${uiRoutes.tasks}?filter=${encodeURIComponent(filter)}`;
}

export function newTaskHref(returnTo: string): string {
  return `${uiRoutes.taskNew}?return_to=${encodeURIComponent(returnTo)}`;
}

export function editTaskHref(id: number, returnTo: string): string {
  return `${uiRoutes.tasks}/${id}/edit?return_to=${encodeURIComponent(returnTo)}`;
}
