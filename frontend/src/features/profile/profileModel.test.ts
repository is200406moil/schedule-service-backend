import { afterEach, describe, expect, it, vi } from "vitest";
import { fieldsFromProfile, matchingGroups, MAX_AVATAR_BYTES, profileName, profilePayload, readAvatarFile, validateAvatarFile } from "./profileModel";
import type { UserProfile } from "../../shared/types";

const profile: UserProfile = {
  id: 2,
  email: "student@example.com",
  is_active: true,
  first_name: "Алексей",
  last_name: "Иванов",
  patronymic: "Сергеевич",
  birth_date: "2006-04-20",
  group_name: "ИКБО-14-23",
  avatar_base64: null,
};

afterEach(() => vi.unstubAllGlobals());

describe("profile form values", () => {
  it("keeps the birth date as a calendar date, without timezone conversion", () => {
    expect(fieldsFromProfile(profile)).toEqual({
      firstName: "Алексей",
      lastName: "Иванов",
      patronymic: "Сергеевич",
      birthDate: "2006-04-20",
      group: "ИКБО-14-23",
    });
  });

  it("represents optional null fields as empty form values", () => {
    expect(fieldsFromProfile({ ...profile, first_name: null, last_name: null, patronymic: null, birth_date: null, group_name: null })).toEqual({
      firstName: "", lastName: "", patronymic: "", birthDate: "", group: "",
    });
  });

  it("trims text and sends explicit nulls to clear all optional fields", () => {
    expect(profilePayload({ firstName: "  ", lastName: "", patronymic: "\t", birthDate: "", group: "\n" })).toEqual({
      first_name: null, last_name: null, patronymic: null, birth_date: null, group_name: null,
    });
    expect(profilePayload({ ...fieldsFromProfile(profile), firstName: "  Алексей  ", group: " ИКБО-14-23 " })).toMatchObject({
      first_name: "Алексей", group_name: "ИКБО-14-23", birth_date: "2006-04-20",
    });
  });

  it("does not send read-only fields or reset an unchanged avatar", () => {
    const payload = profilePayload(fieldsFromProfile(profile));
    for (const field of ["id", "email", "is_active", "avatar_base64"]) expect(payload).not.toHaveProperty(field);
  });

  it("builds a name in family-first order and handles missing name parts", () => {
    expect(profileName(profile)).toBe("Иванов Алексей Сергеевич");
    expect(profileName({ ...profile, first_name: "  Алексей  ", last_name: null, patronymic: " " })).toBe("Алексей");
    expect(profileName({ ...profile, first_name: null, last_name: " ", patronymic: null })).toBe("Имя не указано");
  });
});

describe("group suggestions", () => {
  const groups = ["ИКБО-14-23", "  ИКБО-14-23 ", "икбо-14-23", "ИКБО-15-23", "ИНБО-01-23", " "];

  it("matches case-insensitively, tolerating spaces and missing hyphens", () => {
    expect(matchingGroups(groups, "икбо 14 23")).toEqual(["ИКБО-14-23"]);
    expect(matchingGroups(groups, "15-23")).toEqual(["ИКБО-15-23"]);
  });

  it("deduplicates suggestions, limits them, and leaves the source untouched", () => {
    const original = [...groups];
    expect(matchingGroups(groups, "", 2)).toEqual(["ИКБО-14-23", "ИКБО-15-23"]);
    expect(matchingGroups(groups, "", 0)).toEqual([]);
    expect(matchingGroups(groups, "нет такой группы")).toEqual([]);
    expect(groups).toEqual(original);
  });
});

function mockReader(result: string | ArrayBuffer | null, outcome: "load" | "error" | "abort" = "load") {
  const read = vi.fn();
  vi.stubGlobal("FileReader", class {
    result = result;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    readAsDataURL(file: File) {
      read(file);
      if (outcome === "load") this.onload?.();
      if (outcome === "error") this.onerror?.();
      if (outcome === "abort") this.onabort?.();
    }
  });
  return read;
}

describe("profile avatar", () => {
  it("accepts supported image MIME types and the inclusive 2 MiB limit", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "IMAGE/PNG"]) {
      expect(validateAvatarFile({ type, size: MAX_AVATAR_BYTES })).toBe("");
    }
  });

  it("rejects unsupported types, empty files, and oversize files before reading", async () => {
    expect(validateAvatarFile({ type: "image/svg+xml", size: 100 })).toContain("JPEG, PNG или WebP");
    expect(validateAvatarFile({ type: "image/png", size: 0 })).toContain("пустой");
    expect(validateAvatarFile({ type: "image/png", size: MAX_AVATAR_BYTES + 1 })).toContain("не больше 2 МБ");
    const read = mockReader(null);
    await expect(readAvatarFile({ type: "image/png", size: 0 } as File)).rejects.toThrow("пустой");
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    ["image/jpeg", "\xff\xd8\xff"],
    ["image/png", "\x89PNG\r\n\x1a\n"],
    ["image/webp", "RIFF\0\0\0\0WEBP"],
  ])("returns a valid %s data URL with the original content", async (type, bytes) => {
    const result = `data:${type};base64,${btoa(bytes)}`;
    const read = mockReader(result);
    const file = { type, size: bytes.length } as File;
    await expect(readAvatarFile(file)).resolves.toBe(result);
    expect(read).toHaveBeenCalledWith(file);
  });

  it("rejects a file whose bytes do not match the declared image type", async () => {
    mockReader(`data:image/png;base64,${btoa("not an image")}`);
    await expect(readAvatarFile({ type: "image/png", size: 12 } as File)).rejects.toThrow("не соответствует формату");
  });

  it("handles unreadable, aborted, and malformed FileReader results", async () => {
    const file = { type: "image/png", size: 12 } as File;
    mockReader(null, "error");
    await expect(readAvatarFile(file)).rejects.toThrow("Не удалось прочитать");
    mockReader(null, "abort");
    await expect(readAvatarFile(file)).rejects.toThrow("прервана");
    mockReader(new ArrayBuffer(1));
    await expect(readAvatarFile(file)).rejects.toThrow("Не удалось прочитать");
    mockReader("data:image/png;base64,%%%%");
    await expect(readAvatarFile(file)).rejects.toThrow("Не удалось прочитать");
  });
});
