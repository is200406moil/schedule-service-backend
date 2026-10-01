import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileDetailsForm } from "./ProfileDetailsForm";
import { ProfileTasks } from "./ProfileTasks";
import { ProfileSummary } from "./ProfileSummary";
import { Shell } from "./Shell";
import type { BootData, UserProfile } from "./types";

const profile: UserProfile = {
  id: 1, email: "student@example.com", is_active: true,
  first_name: "Анна", last_name: null, patronymic: null,
  birth_date: "2006-04-20", group_name: "ИКБО-14-23", avatar_base64: null,
};
const user: BootData = {
  firstName: "Анна", group: "ИКБО-14-23", avatar: "", today: "2026-10-01", csrfToken: "test",
};

describe("profile controls", () => {
  it("renders optional details without an editable email or avatar field", () => {
    const html = renderToStaticMarkup(<ProfileDetailsForm profile={profile} busy={false} saving={false} onSave={async () => profile} />);
    expect(html).not.toContain('required=""');
    expect(html.match(/<input /g)).toHaveLength(5);
    expect(html).toContain('autoComplete="family-name"');
    expect(html).toContain('autoComplete="given-name"');
    expect(html).toContain('type="date"');
    expect(html).toContain('value="2006-04-20"');
    expect(html).toContain('max="9999-12-31"');
    expect(html).toContain('maxLength="120"');
    expect(html).toContain('maxLength="64"');
    expect(html).toContain('aria-describedby="profile-group-hint"');
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain('type="file"');
  });

  it("locks all detail inputs while a photo or details save is pending", () => {
    const html = renderToStaticMarkup(<ProfileDetailsForm profile={profile} busy saving onSave={async () => profile} />);
    expect(html.match(/<input[^>]*disabled=""/g)).toHaveLength(5);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Сохраняем…");
  });

  it("marks only the profile navigation entry current", () => {
    const html = renderToStaticMarkup(<Shell user={user} section="profile" onCreateTask={() => {}}>Профиль</Shell>);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('href="/ui/profile/preview"');
    expect(html).not.toContain('href="/ui/profile"');
    expect(html).toContain('class="mobile-add"');
  });

  it("keeps the direct-create fallback return destination on the profile", () => {
    const html = renderToStaticMarkup(<Shell user={user} section="profile">Профиль</Shell>);
    expect(html).toContain('href="/ui/tasks/new/preview?return_to=%2Fui%2Fprofile%2Fpreview"');
  });

  it("offers retry after task loading fails", () => {
    const html = renderToStaticMarkup(<ProfileTasks tasks={{ kind: "error" }} today={user.today} onRetry={() => {}} onCreate={() => {}} />);
    expect(html).toContain("Повторить");
    expect(html).not.toContain("Активных задач нет");
  });

  it("shows zero task counts and creation for an empty account", () => {
    const html = renderToStaticMarkup(<ProfileTasks tasks={{ kind: "ready", data: [] }} today={user.today} onRetry={() => {}} onCreate={() => {}} />);
    expect(html).toContain("Активных задач нет");
    expect(html).toContain("Добавить задачу");
    expect(html).toContain('href="/ui/tasks/preview?filter=active"');
    expect(html).toContain('href="/ui/tasks/preview?filter=done"');
  });

  it("shows the profile as readable facts, not a disabled form", () => {
    const html = renderToStaticMarkup(<ProfileSummary profile={profile} />);
    expect(html).toContain("Анна");
    expect(html).toContain("student@example.com");
    expect(html).toContain("20 апреля 2006");
    expect(html).toContain("<dl");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("Сохранить");
    expect(html).not.toContain("Отмена");
    expect(html).not.toContain("Добавить фото");
  });
});
