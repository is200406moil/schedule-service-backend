import { ChevronDown, LogOut, Pencil, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { BootData } from "./types";

export function AccountMenu({ user, isProfile = false }: { user: BootData; isProfile?: boolean }) {
  const details = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const name = user.firstName.trim() || "Профиль";

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !details.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      details.current?.querySelector("summary")?.focus();
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <details
      className="account-menu"
      ref={details}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <summary className="account-toggle" aria-label={`Меню аккаунта: ${name}`}>
        <AccountAvatar user={user} />
        <span className="account-toggle-copy"><strong>{name}</strong><small>{user.group || "Группа не указана"}</small></span>
        <ChevronDown className="account-chevron" size={17} aria-hidden="true" />
      </summary>
      <div className="account-dropdown">
        <div className="account-menu-info"><strong>{name}</strong><span>{user.group || "Группа не указана"}</span></div>
        <nav aria-label="Аккаунт">
          <a href="/ui/profile/preview" aria-current={isProfile ? "page" : undefined}><UserRound size={18} aria-hidden="true" />Профиль</a>
          <a href="/ui/profile/preview?edit=1"><Pencil size={18} aria-hidden="true" />Редактировать профиль</a>
        </nav>
        <form action="/ui/logout" method="post" className="account-logout">
          <input type="hidden" name="csrf_token" value={user.csrfToken} />
          <button type="submit"><LogOut size={18} aria-hidden="true" />Выйти</button>
        </form>
      </div>
    </details>
  );
}

function AccountAvatar({ user }: { user: BootData }) {
  if (user.avatar) return <img className="account-avatar" src={user.avatar} alt="" width="34" height="34" />;
  return <span className="account-avatar account-avatar-fallback" aria-hidden="true">{user.firstName.trim().charAt(0).toUpperCase() || "М"}</span>;
}
