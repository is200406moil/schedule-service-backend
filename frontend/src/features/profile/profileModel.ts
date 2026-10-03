import type { ProfileUpdate, UserProfile } from "../../shared/types";

export type ProfileFields = {
  firstName: string;
  lastName: string;
  patronymic: string;
  birthDate: string;
  group: string;
};

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const avatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type ProfileDetails = Pick<UserProfile, "first_name" | "last_name" | "patronymic" | "birth_date" | "group_name">;

export function fieldsFromProfile(profile: ProfileDetails): ProfileFields {
  return {
    firstName: profile.first_name ?? "",
    lastName: profile.last_name ?? "",
    patronymic: profile.patronymic ?? "",
    birthDate: profile.birth_date ?? "",
    group: profile.group_name ?? "",
  };
}

export function profilePayload(fields: ProfileFields): ProfileUpdate {
  return {
    first_name: fields.firstName.trim() || null,
    last_name: fields.lastName.trim() || null,
    patronymic: fields.patronymic.trim() || null,
    birth_date: fields.birthDate || null,
    group_name: fields.group.trim() || null,
  };
}

export function profileName(profile: UserProfile): string {
  return [profile.last_name, profile.first_name, profile.patronymic]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ") || "Имя не указано";
}

function comparableGroup(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/[\s-]+/g, "");
}

export function matchingGroups(groups: readonly string[], query: string, limit = 8): string[] {
  const normalized = comparableGroup(query);
  const unique = new Set<string>();
  const result: string[] = [];
  if (limit <= 0) return result;
  for (const group of groups) {
    const name = group.trim();
    const comparable = comparableGroup(name);
    if (!name || unique.has(comparable) || !comparable.includes(normalized)) continue;
    unique.add(comparable);
    result.push(name);
    if (result.length >= limit) break;
  }
  return result;
}

export function validateAvatarFile(file: { type: string; size: number }): string {
  if (!avatarTypes.has(file.type.toLowerCase())) return "Выберите фотографию в формате JPEG, PNG или WebP.";
  if (file.size === 0) return "Этот файл пустой. Выберите другую фотографию.";
  if (file.size > MAX_AVATAR_BYTES) return "Фотография должна быть не больше 2 МБ.";
  return "";
}

function matchesAvatarSignature(type: string, signature: string): boolean {
  if (type === "image/jpeg") return signature.startsWith("\xff\xd8\xff");
  if (type === "image/png") return signature.startsWith("\x89PNG\r\n\x1a\n");
  return signature.startsWith("RIFF") && signature.slice(8, 12) === "WEBP";
}

export function readAvatarFile(file: File): Promise<string> {
  const validationError = validateAvatarFile(file);
  if (validationError) return Promise.reject(new Error(validationError));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать фотографию. Попробуйте выбрать файл ещё раз."));
    reader.onabort = () => reject(new Error("Загрузка фотографии прервана. Выберите файл ещё раз."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Не удалось прочитать фотографию. Попробуйте другой файл."));
        return;
      }
      const encoded = reader.result.split(",", 2)[1];
      const type = file.type.toLowerCase();
      try {
        if (!encoded || !matchesAvatarSignature(type, atob(encoded.slice(0, 16)))) {
          reject(new Error("Содержимое файла не соответствует формату фотографии. Выберите другой файл."));
          return;
        }
      } catch {
        reject(new Error("Не удалось прочитать фотографию. Попробуйте другой файл."));
        return;
      }
      resolve(`data:${type};base64,${encoded}`);
    };
    reader.readAsDataURL(file);
  });
}
