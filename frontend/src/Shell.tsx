import { CalendarDays, ClipboardList, LayoutDashboard, Plus, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import type { BootData } from "./types";

const navigation = [
  { href: "/ui/preview", label: "Обзор", icon: LayoutDashboard, active: true },
  { href: "/ui/calendar", label: "Календарь", icon: CalendarDays, active: false },
  { href: "/ui/tasks", label: "Задачи", icon: ClipboardList, active: false },
];

export function Shell({ user, children }: { user: BootData; children: ReactNode }) {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      <aside className="sidebar" aria-label="Навигация">
        <a className="brand" href="/ui/preview" aria-label="Мой семестр — обзор">
          <span className="brand-symbol" aria-hidden="true"><i /><i /><i /></span>
          <span>мой<br />семестр<span className="brand-period">.</span></span>
        </a>
        <div className="sidebar-section-label">Рабочее место</div>
        <nav className="side-nav" aria-label="Основная навигация">
          {navigation.map(({ href, label, icon: Icon, active }) => (
            <a key={href} href={href} className={active ? "is-current" : undefined} aria-current={active ? "page" : undefined}>
              <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a className="profile-link" href="/ui/profile">
            <Avatar user={user} />
            <span><strong>{user.firstName || "Профиль"}</strong><small>{user.group || "Указать группу"}</small></span>
            <UserRound size={17} aria-hidden="true" />
          </a>
        </div>
      </aside>

      <header className="mobile-header">
        <a className="mobile-brand" href="/ui/preview"><span className="mobile-brand-mark">м</span> мой семестр<span>.</span></a>
        <a className="mobile-add" href="/ui/tasks/new" aria-label="Создать задачу"><Plus size={22} aria-hidden="true" /></a>
      </header>

      <main id="main" className="workspace" tabIndex={-1}>{children}</main>

      <nav className="mobile-nav" aria-label="Основная навигация">
        {navigation.map(({ href, label, icon: Icon, active }) => (
          <a key={href} href={href} className={active ? "is-current" : undefined} aria-current={active ? "page" : undefined}>
            <Icon size={21} strokeWidth={1.9} aria-hidden="true" />
            <span>{label}</span>
          </a>
        ))}
        <a href="/ui/profile"><UserRound size={21} strokeWidth={1.9} aria-hidden="true" /><span>Профиль</span></a>
      </nav>
    </div>
  );
}

function Avatar({ user }: { user: BootData }) {
  if (user.avatar) return <img className="profile-avatar" src={user.avatar} alt="" />;
  return <span className="profile-avatar profile-avatar-fallback" aria-hidden="true">{user.firstName.charAt(0).toUpperCase() || "М"}</span>;
}
