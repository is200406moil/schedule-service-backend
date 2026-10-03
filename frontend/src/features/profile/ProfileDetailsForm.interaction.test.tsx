// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileDetailsForm } from "./ProfileDetailsForm";
import type { UserProfile } from "../../shared/types";

const profile: UserProfile = {
  id: 1, email: "student@example.com", is_active: true,
  first_name: "Анна", last_name: null, patronymic: null,
  birth_date: "2006-04-20", group_name: "ИКБО-14-23", avatar_base64: null,
};

describe("profile details draft", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function render(value: UserProfile) {
    await act(async () => {
      root.render(<ProfileDetailsForm profile={value} busy={false} saving={false} onSave={async () => value} />);
    });
  }

  async function editFirstName(value: string) {
    const input = container.querySelector<HTMLInputElement>("#profile-first-name")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("keeps an unsaved draft when only the avatar changes", async () => {
    await render(profile);
    await editFirstName("Аня");
    expect(container.textContent).toContain("Изменения не сохранены");
    await render({ ...profile, avatar_base64: "data:image/png;base64,example" });
    expect(container.querySelector<HTMLInputElement>("#profile-first-name")!.value).toBe("Аня");
    expect(container.textContent).toContain("Изменения не сохранены");
  });

  it("updates the draft when saved details actually change", async () => {
    await render(profile);
    await editFirstName("Аня");
    await render({ ...profile, first_name: "Анна Сергеевна", group_name: "ИКБО-15-23" });
    expect(container.querySelector<HTMLInputElement>("#profile-first-name")!.value).toBe("Анна Сергеевна");
    expect(container.querySelector<HTMLInputElement>("#profile-group")!.value).toBe("ИКБО-15-23");
    expect(container.textContent).not.toContain("Изменения не сохранены");
  });

  it("cancel restores the latest saved details without submitting", async () => {
    await render(profile);
    await editFirstName("Аня");
    const cancel = container.querySelector<HTMLButtonElement>('button[type="button"]')!;
    await act(async () => cancel.click());
    expect(container.querySelector<HTMLInputElement>("#profile-first-name")!.value).toBe("Анна");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  });
});
