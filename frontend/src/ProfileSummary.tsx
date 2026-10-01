import { GraduationCap, UserRound } from "lucide-react";
import { formatDate } from "./dates";
import { profileName } from "./profileModel";
import type { UserProfile } from "./types";

export function ProfileSummary({ profile }: { profile: UserProfile }) {
  return (
    <section className="profile-summary" aria-labelledby="profile-name">
      <div className="profile-summary-heading">
        <div className="profile-picture">
          {profile.avatar_base64 ? (
            <img src={profile.avatar_base64} width={88} height={88} alt="Фотография профиля" />
          ) : (
            <span aria-hidden="true">
              {profile.first_name?.charAt(0).toLocaleUpperCase("ru-RU") || <UserRound size={34} />}
            </span>
          )}
        </div>
        <div className="profile-summary-name">
          <h2 id="profile-name">{profileName(profile)}</h2>
          <span className="profile-account-group">
            <GraduationCap size={17} aria-hidden="true" />
            {profile.group_name || "Группа не указана"}
          </span>
        </div>
      </div>
      <dl className="profile-facts">
        <div><dt>Электронная почта</dt><dd>{profile.email}</dd></div>
        <div><dt>Учебная группа</dt><dd>{profile.group_name || "Не указана"}</dd></div>
        <div>
          <dt>Дата рождения</dt>
          <dd>{profile.birth_date ? formatDate(profile.birth_date, { day: "numeric", month: "long", year: "numeric" }) : "Не указана"}</dd>
        </div>
      </dl>
    </section>
  );
}
