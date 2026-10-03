export type AuthBoot = {
  page: "login" | "register";
  csrfToken: string;
  email: string;
  error: string | null;
  ok: string | null;
  mailMode?: "disabled" | "local" | "smtp";
  verificationRequired?: boolean;
};

export type PrivacyBoot = {
  page: "privacy";
  operatorName: string;
  contactEmail: string;
  cookieMinutes: number;
};

export type RecoveryBoot = {
  page: "forgot-password" | "password-reset";
  csrfToken: string;
  email: string;
  error: string | null;
  ok: "requested" | null;
  mailMode: "disabled" | "local" | "smtp";
};

export type VerificationBoot = {
  page: "email-verification" | "verify-email";
  csrfToken: string;
  email: string;
  error: string | null;
  ok: "requested" | "registered" | null;
  mailMode: "disabled" | "local" | "smtp";
  verificationRequired: boolean;
};

export type PublicBoot = AuthBoot | PrivacyBoot | RecoveryBoot | VerificationBoot;
