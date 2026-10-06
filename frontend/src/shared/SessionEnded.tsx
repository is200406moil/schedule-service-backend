import { Shell } from "./Shell";
import type { BootData } from "./types";

export function SessionEnded({ user, section }: { user: BootData; section: "overview" | "calendar" | "tasks" | "profile" }) {
  return (
    <Shell user={user} section={section} hideMobileAdd allowGroupPrompt={false}>
      <div className="workspace-inner">
        <section className="session-ended" aria-labelledby="session-title">
          <p className="eyebrow">Мой семестр</p>
          <h1 id="session-title">Нужно войти снова</h1>
          <p>Сеанс завершился. Войдите, чтобы продолжить работу. Сохранённые данные останутся на месте.</p>
          <a className="primary-action" href="/ui/login">Войти</a>
        </section>
      </div>
    </Shell>
  );
}
