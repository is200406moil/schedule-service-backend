import { useRef } from "react";
import { Camera, UserRound } from "lucide-react";
import type { UserProfile } from "./types";

type Props = {
  profile: UserProfile;
  busy: boolean;
  saving: boolean;
  error: string;
  onSave: (file: File | null) => Promise<void>;
};

export function ProfilePhotoEditor({ profile, busy, saving, error, onSave }: Props) {
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    try { await onSave(file); }
    finally { if (input.current) input.current.value = ""; }
  }

  return (
    <section className="profile-photo-editor" aria-label="Фотография">
      <div className="profile-picture">
        {profile.avatar_base64 ? (
          <img src={profile.avatar_base64} width={88} height={88} alt="Фотография профиля" />
        ) : (
          <span aria-hidden="true"><UserRound size={34} /></span>
        )}
      </div>
      <div className="profile-photo-controls">
        <button type="button" className="profile-secondary-button" disabled={busy} onClick={() => input.current?.click()}>
          <Camera size={17} aria-hidden="true" />
          {saving ? "Сохраняем фото…" : profile.avatar_base64 ? "Сменить фото" : "Добавить фото"}
        </button>
        {profile.avatar_base64 ? <button type="button" className="profile-text-button" disabled={busy} onClick={() => void onSave(null)}>Удалить фото</button> : null}
      </div>
      <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="Фотография профиля" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void upload(file);
      }} />
      <p className="profile-photo-hint">JPEG, PNG или WebP, до 2 МБ.<br />Фото сохраняется сразу.</p>
      {error ? <p className="profile-photo-error" role="alert">{error}</p> : null}
    </section>
  );
}
