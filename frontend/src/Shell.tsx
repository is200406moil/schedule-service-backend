import { CalendarDays, ClipboardList, LayoutDashboard, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { AccountMenu } from "./AccountMenu";
import { Brand } from "./Brand";
import type { BootData } from "./types";

const navigation = [
  { href: "/ui/preview", label: "Обзор", icon: LayoutDashboard, section: "overview" },
  { href: "/ui/calendar/preview", label: "Календарь", icon: CalendarDays, section: "calendar" },
  { href: "/ui/tasks/preview", label: "Задачи", icon: ClipboardList, section: "tasks" },
] as const;

export function Shell({ user, children, section = "overview", createReturnTo, hideMobileAdd = false, onCreateTask }: { user: BootData; children: ReactNode; section?: "overview" | "calendar" | "tasks" | "profile"; createReturnTo?: string; hideMobileAdd?: boolean; onCreateTask?: () => void }) {
  const returnTo = createReturnTo ?? (section === "profile" ? "/ui/profile/preview" : section === "calendar" ? "/ui/calendar/preview" : section === "tasks" ? "/ui/tasks/preview" : "/ui/preview");
  return (
    <div className="shell">
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      <aside className="sidebar" aria-label="Навигация">
        <Brand />
        <nav className="side-nav" aria-label="Основная навигация">
          {navigation.map(({ href, label, icon: Icon, section: itemSection }) => (
            <a key={href} href={href} className={itemSection === section ? "is-current" : undefined} aria-current={itemSection === section ? "page" : undefined}>
              <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </aside>

      <header className="workspace-header">
        <div className="workspace-header-inner">
          <Brand className="header-brand" />
          <div className="workspace-header-actions">
            {hideMobileAdd ? null : onCreateTask
              ? <button type="button" className="mobile-add" onClick={onCreateTask} aria-label="Создать задачу"><Plus size={22} aria-hidden="true" /></button>
              : <a className="mobile-add" href={`/ui/tasks/new/preview?return_to=${encodeURIComponent(returnTo)}`} aria-label="Создать задачу"><Plus size={22} aria-hidden="true" /></a>}
            <AccountMenu user={user} isProfile={section === "profile"} />
          </div>
        </div>
      </header>

      <main id="main" className="workspace" tabIndex={-1}>{children}</main>

      <nav className="mobile-nav" aria-label="Основная навигация">
        {navigation.map(({ href, label, icon: Icon, section: itemSection }) => (
          <a key={href} href={href} className={itemSection === section ? "is-current" : undefined} aria-current={itemSection === section ? "page" : undefined}>
            <Icon size={21} strokeWidth={1.9} aria-hidden="true" />
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
