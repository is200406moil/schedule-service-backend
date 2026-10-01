import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { ApiError, createTask, getTasks, UnauthorizedError, updateProfile } from "./api";
import { formatDate } from "./dates";
import { ProfileDetailsForm } from "./ProfileDetailsForm";
import { ProfilePhotoEditor } from "./ProfilePhotoEditor";
import { ProfileSummary } from "./ProfileSummary";
import { ProfileTasks } from "./ProfileTasks";
import { profilePayload, readAvatarFile } from "./profileModel";
import type { ProfileFields } from "./profileModel";
import { SessionEnded } from "./SessionEnded";
import { Shell } from "./Shell";
import { TaskCreateDialog } from "./TaskCreateDialog";
import type { Loadable, NewTask, ProfileBootData, Task } from "./types";

export function ProfileApp({ boot }: { boot: ProfileBootData }) {
  const [profile, setProfile] = useState(boot.profile);
  const [tasks, setTasks] = useState<Loadable<Task[]>>({ kind: "loading" });
  const [taskRetry, setTaskRetry] = useState(0);
  const [pending, setPending] = useState<"details" | "avatar" | null>(null);
  const [avatarError, setAvatarError] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(boot.initialEdit);
  const saving = useRef(false);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const focusHeadingAfterEdit = useRef(false);
  const shellUser = { ...boot, firstName: profile.first_name ?? "", group: profile.group_name ?? "", avatar: profile.avatar_base64 ?? "" };

  useEffect(() => {
    const warnWhileSaving = (event: BeforeUnloadEvent) => {
      if (!saving.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnWhileSaving);
    return () => window.removeEventListener("beforeunload", warnWhileSaving);
  }, []);

  useEffect(() => {
    if (editing || !focusHeadingAfterEdit.current) return;
    focusHeadingAfterEdit.current = false;
    pageHeading.current?.focus({ preventScroll: true });
  }, [editing]);

  useEffect(() => {
    const controller = new AbortController();
    setTasks({ kind: "loading" });
    getTasks(controller.signal).then((data) => setTasks({ kind: "ready", data })).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof UnauthorizedError) setSessionExpired(true);
      else setTasks({ kind: "error" });
    });
    return () => controller.abort();
  }, [taskRetry]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function saveDetails(fields: ProfileFields) {
    if (saving.current) throw new Error("Сохранение уже выполняется.");
    saving.current = true;
    setPending("details");
    try {
      const saved = await updateProfile(profilePayload(fields), boot.csrfToken);
      setProfile(saved);
      setNotice("Данные сохранены");
      return saved;
    } catch (error) {
      if (error instanceof UnauthorizedError) setSessionExpired(true);
      throw error;
    } finally { saving.current = false; setPending(null); }
  }

  async function saveAvatar(file: File | null) {
    if (saving.current) return;
    saving.current = true;
    setPending("avatar");
    setAvatarError("");
    try {
      const value = file === null ? null : await readAvatarFile(file);
      setProfile(await updateProfile({ avatar_base64: value }, boot.csrfToken));
      setNotice(file ? "Фотография обновлена" : "Фотография удалена");
    } catch (error) {
      if (error instanceof UnauthorizedError) setSessionExpired(true);
      else if (error instanceof ApiError && error.status === 403) setAvatarError("Не удалось подтвердить запрос. Обновите страницу и повторите.");
      else if (error instanceof ApiError && error.status === 422) setAvatarError("Не удалось загрузить фото. Выберите JPEG, PNG или WebP до 2 МБ.");
      else if (error instanceof ApiError || error instanceof TypeError) setAvatarError("Не удалось сохранить фотографию. Попробуйте ещё раз.");
      else setAvatarError(error instanceof Error ? error.message : "Не удалось прочитать файл. Выберите другую фотографию.");
    } finally {
      saving.current = false;
      setPending(null);
    }
  }

  async function handleCreate(data: NewTask) {
    try {
      const created = await createTask(data, boot.csrfToken);
      setTasks((current) => current.kind === "ready" ? { kind: "ready", data: [...current.data, created] } : current);
      if (tasks.kind !== "ready") setTaskRetry((value) => value + 1);
      setNotice("Задача добавлена");
    } catch (error) { if (error instanceof UnauthorizedError) setSessionExpired(true); throw error; }
  }

  if (sessionExpired) return <SessionEnded user={shellUser} section="profile" />;

  function closeEditor() {
    focusHeadingAfterEdit.current = true;
    setEditing(false);
    setAvatarError("");
    window.history.replaceState({}, "", "/ui/profile/preview");
  }

  return (
    <Shell user={shellUser} section="profile" onCreateTask={() => setCreateOpen(true)}>
      <div className="workspace-inner profile-view">
        <div className="page-topline"><span>{formatDate(boot.today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span><a className="old-version-link" href="/ui/profile">Прежний профиль <ArrowUpRight size={15} aria-hidden="true" /></a></div>
        <header className="profile-page-head">
          <h1 ref={pageHeading} tabIndex={-1}>{editing ? "Редактирование профиля" : "Профиль"}</h1>
        </header>
        {editing ? (
          <>
            <a className="profile-back" href="/ui/profile/preview"><ArrowLeft size={17} aria-hidden="true" /> К профилю</a>
            <div className="profile-editor-card">
              <ProfilePhotoEditor profile={profile} busy={pending !== null} saving={pending === "avatar"} error={avatarError} onSave={saveAvatar} />
              <ProfileDetailsForm profile={profile} busy={pending !== null} saving={pending === "details"} onSave={saveDetails} onCancel={closeEditor} onSaved={closeEditor} />
            </div>
          </>
        ) : (
          <div className="profile-layout">
            <ProfileSummary profile={profile} />
            <ProfileTasks tasks={tasks} today={boot.today} onRetry={() => setTaskRetry((value) => value + 1)} onCreate={() => setCreateOpen(true)} />
          </div>
        )}
      </div>
      <TaskCreateDialog open={createOpen} group={shellUser.group} onClose={() => setCreateOpen(false)} onCreate={handleCreate} />
      <div className={`notice${notice ? " is-visible" : ""}`} role="status" aria-live="polite">{notice}</div>
    </Shell>
  );
}
