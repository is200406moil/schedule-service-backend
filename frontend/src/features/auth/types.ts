export type AuthBoot = {
  page: "login" | "register";
  csrfToken: string;
  email: string;
  error: string | null;
  ok: string | null;
};

export type PrivacyBoot = {
  page: "privacy";
  operatorName: string;
  contactEmail: string;
  cookieMinutes: number;
};

export type PublicBoot = AuthBoot | PrivacyBoot;
