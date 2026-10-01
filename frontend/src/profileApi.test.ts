import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getGroups, getProfile, UnauthorizedError, updateProfile } from "./api";
import type { ProfileUpdate, UserProfile } from "./types";

const profile: UserProfile = {
  id: 2,
  email: "student@example.com",
  is_active: true,
  first_name: "Алексей",
  last_name: null,
  patronymic: null,
  birth_date: null,
  group_name: "ИКБО-14-23",
  avatar_base64: null,
};

afterEach(() => vi.unstubAllGlobals());

describe("profile API", () => {
  it("loads the current profile with same-origin credentials and abort support", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;

    await expect(getProfile(signal)).resolves.toEqual(profile);
    expect(fetchMock).toHaveBeenCalledWith("/auth/me", { credentials: "same-origin", signal });
  });

  it("saves editable fields, including explicit clearing, with CSRF protection", async () => {
    const payload: ProfileUpdate = { first_name: "Исмаил", birth_date: "2006-04-20", group_name: null, avatar_base64: null };
    const updated = { ...profile, ...payload };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(updated), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateProfile(payload, "test-token")).resolves.toEqual(updated);
    expect(fetchMock).toHaveBeenCalledWith("/auth/me", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": "test-token" },
      body: JSON.stringify(payload),
    });
  });

  it("allows an avatar-only update without overwriting the other profile fields", async () => {
    const payload: ProfileUpdate = { avatar_base64: "data:image/png;base64,iVBORw0KGgo=" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...profile, ...payload }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await updateProfile(payload, "test-token");
    expect(fetchMock).toHaveBeenCalledWith("/auth/me", expect.objectContaining({ body: JSON.stringify(payload) }));
  });

  it("distinguishes an expired session on both read and update", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    await expect(getProfile()).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(updateProfile({ first_name: null }, "test-token")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it.each([403, 422])("exposes HTTP %s update failures without treating them as session expiry", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status })));
    const request = updateProfile({ first_name: null }, "test-token");
    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({ status });
  });

  it("loads the full groups response, including count, with abort support", async () => {
    const groups = { count: 2, groups: ["ИКБО-14-23", "ИКБО-15-23"] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(groups), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;

    await expect(getGroups(signal)).resolves.toEqual(groups);
    expect(fetchMock).toHaveBeenCalledWith("/schedule/groups", { credentials: "same-origin", signal });
  });

  it("reports group service failures as ordinary API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    await expect(getGroups()).rejects.toMatchObject({ status: 503 });
  });
});
