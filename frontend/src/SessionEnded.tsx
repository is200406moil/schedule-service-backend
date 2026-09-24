import { Shell } from "./Shell";
import type { BootData } from "./types";

export function SessionEnded({ user, section }: { user: BootData; section: "overview" | "calendar" | "tasks" }) {
  return (
    <Shell user={user} section={section}>
      <div className="workspace-inner">
        <section className="session-ended" aria-labelledby="session-title">
          <p className="eyebrow">Мой семестр</p>
          <h1 id="session-title">Нужно войти снова</h1>
          <p>Вы давно не открывали эту страницу, и сеанс завершился. После входа расписание и задачи снова загрузятся.</p>
          <a className="primary-action" href="/ui/login">Войти</a>
        </section>
      </div>
    </Shell>
  );
}
