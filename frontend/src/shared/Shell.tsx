import { CalendarDays, ClipboardList, LayoutDashboard, Plus } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { AccountMenu } from "./AccountMenu";
import { Brand } from "./Brand";
import { CookieNotice } from "./CookieNotice";
import { GroupChoiceDialog } from "./GroupChoiceDialog";
import { newTaskHref, uiRoutes } from "./uiRoutes";
import type { BootData } from "./types";

const navigation = [
  { href: uiRoutes.overview, label: "Обзор", icon: LayoutDashboard, section: "overview" },
  { href: uiRoutes.calendar, label: "Календарь", icon: CalendarDays, section: "calendar" },
  { href: uiRoutes.tasks, label: "Задачи", icon: ClipboardList, section: "tasks" },
] as const;

type Section = "overview" | "calendar" | "tasks" | "profile";

function Navigation({ section, mobile = false }: { section: Section; mobile?: boolean }) {
  return (
    <nav className={mobile ? "mobile-nav" : "side-nav"} aria-label="Основная навигация">
      {navigation.map(({ href, label, icon: Icon, section: itemSection }) => (
        <a key={href} href={href} className={itemSection === section ? "is-current" : undefined} aria-current={itemSection === section ? "page" : undefined}>
          <Icon size={mobile ? 21 : 20} strokeWidth={1.9} aria-hidden="true" />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}

export function Shell({ user, children, section = "overview", createReturnTo, hideMobileAdd = false, onCreateTask, allowGroupPrompt = true }: { user: BootData; children: ReactNode; section?: "overview" | "calendar" | "tasks" | "profile"; createReturnTo?: string; hideMobileAdd?: boolean; onCreateTask?: () => void; allowGroupPrompt?: boolean }) {
  const main = useRef<HTMLElement>(null);
  const [chooseGroup, setChooseGroup] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("choose_group") === "1");
  const returnTo = createReturnTo ?? uiRoutes[section];

  function finishGroupChoice(saved: boolean) {
    const url = new URL(window.location.href);
    url.searchParams.delete("choose_group");
    const destination = `${url.pathname}${url.search}${url.hash}`;
    setChooseGroup(false);
    if (saved) window.location.replace(destination);
    else {
      window.history.replaceState(window.history.state, "", destination);
      main.current?.focus();
    }
  }
  return (
    <div className="shell">
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      <aside className="sidebar" aria-label="Навигация">
        <Brand />
        <Navigation section={section} />
      </aside>

      <header className="workspace-header">
        <div className="workspace-header-inner">
          <Brand className="header-brand" />
          <div className="workspace-header-actions">
            {hideMobileAdd ? null : onCreateTask
              ? <button type="button" className="mobile-add" onClick={onCreateTask} aria-label="Создать задачу"><Plus size={22} aria-hidden="true" /></button>
              : <a className="mobile-add" href={newTaskHref(returnTo)} aria-label="Создать задачу"><Plus size={22} aria-hidden="true" /></a>}
            <AccountMenu user={user} isProfile={section === "profile"} />
          </div>
        </div>
      </header>

      <main ref={main} id="main" className="workspace" tabIndex={-1}>
        <CookieNotice onDismiss={() => main.current?.focus()} />
        {children}
      </main>

      <Navigation section={section} mobile />
      {allowGroupPrompt && chooseGroup && !user.group.trim() ? <GroupChoiceDialog csrfToken={user.csrfToken} onLater={() => finishGroupChoice(false)} onSaved={() => finishGroupChoice(true)} /> : null}
    </div>
  );
}
