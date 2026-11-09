export type AuthEnv = {
  [key: string]: string | undefined;
};

const PUBLIC_AUTH_ENV = [
  "NEXT_PUBLIC_BETTER_AUTH_URL",
  "NEXT_PUBLIC_BETTER_AUTH_SECRET",
  "NEXT_PUBLIC_DATABASE_URL",
  "NEXT_PUBLIC_RECORD_KEEPER_EMAIL",
  "NEXT_PUBLIC_RESEND_API_KEY",
  "PUBLIC_BETTER_AUTH_URL",
] as const;

/** Password, social, and account-takeover routes. Magic link is not in this list. */
export const CLOSED_AUTH_PATHS = [
  "/sign-up/email",
  "/sign-in/email",
  "/change-password",
  "/request-password-reset",
  "/reset-password",
  "/verify-password",
  "/sign-in/social",
  "/link-social",
  "/delete-user",
  "/delete-user/callback",
  "/change-email",
] as const;

export function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || !email.includes("@") || email.startsWith("@") || email.endsWith("@")) return null;
  return email;
}

export function isRecordKeeperEmail(
  email: string | null | undefined,
  allowlisted: string | null | undefined,
): boolean {
  const candidate = normalizeEmail(email);
  const allowed = normalizeEmail(allowlisted);
  if (!candidate || !allowed) return false;
  return candidate === allowed;
}

export function allowUserCreate(user: { email?: unknown }, allowlisted: string | null | undefined): boolean {
  return typeof user.email === "string" && isRecordKeeperEmail(user.email, allowlisted);
}

export function allowUserUpdate(user: { email?: unknown }, allowlisted: string | null | undefined): boolean {
  if (user.email === undefined) return true;
  return typeof user.email === "string" && isRecordKeeperEmail(user.email, allowlisted);
}

export function allowVerificationCreate(
  data: { identifier?: unknown; value?: unknown },
  allowlisted: string | null | undefined,
): boolean {
  const identifier = typeof data.identifier === "string" ? data.identifier : "";
  const email = magicLinkEmail(data.value);
  const magicLink = identifier.startsWith("magic-link:") || email !== null;
  if (!magicLink) return false;
  return isRecordKeeperEmail(email, allowlisted);
}

/**
 * Production passes BETTER_AUTH_URL through. Anywhere else, including preview,
 * leaves it unset so Better Auth uses the request host. VERCEL_URL is ignored.
 */
export function resolveAuthBaseURL(env: AuthEnv): string | undefined {
  const configured = env.BETTER_AUTH_URL?.trim();
  return configured || undefined;
}

export function assertServerOnlyAuthEnv(env: AuthEnv): void {
  for (const name of PUBLIC_AUTH_ENV) {
    if (env[name]?.trim()) {
      throw new Error(`${name} must not be set`);
    }
  }

  const baseUrl = env.BASE_URL?.trim();
  if (!env.BETTER_AUTH_URL?.trim() && baseUrl && baseUrl !== "/" && /^https?:\/\//i.test(baseUrl)) {
    throw new Error("BASE_URL must not replace an unset BETTER_AUTH_URL");
  }
}

export function requireAuthSecret(env: AuthEnv): string {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is not set");
  }
  return secret;
}

export function sessionCookieAttributes(nodeEnv: string | undefined): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
} {
  return {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "lax",
  };
}

export function authSecurityOptions(env: AuthEnv) {
  return {
    baseURL: resolveAuthBaseURL(env),
    emailAndPassword: { enabled: false as const, disableSignUp: true as const },
    session: { cookieCache: { enabled: false as const } },
    advanced: {
      useSecureCookies: env.NODE_ENV === "production",
      defaultCookieAttributes: sessionCookieAttributes(env.NODE_ENV),
      crossSubDomainCookies: { enabled: false as const },
    },
  };
}

export function redactAuthText(value: string, secrets: Array<string | undefined>): string {
  let text = value;
  for (const secret of secrets) {
    const trimmed = secret?.trim();
    if (!trimmed || trimmed.length < 12) continue;
    text = text.split(trimmed).join("[redacted]");
  }
  text = text.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]");
  text = text.replace(/https?:\/\/\S*magic-link\/verify\S*/gi, "[redacted]");
  text = text.replace(/([?&]token=)[^&\s]+/gi, "$1[redacted]");
  text = text.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  return text;
}

export function authSecretValues(env: AuthEnv): Array<string | undefined> {
  return [env.BETTER_AUTH_SECRET, env.DATABASE_URL, env.RESEND_API_KEY];
}

export function logAuthFailure(error: unknown, env: AuthEnv = process.env): void {
  const message = error instanceof Error ? error.message : "sign-in failed";
  console.error(redactAuthText(message, authSecretValues(env)));
}

function magicLinkEmail(value: unknown): string | null {
  const record = typeof value === "string" ? parseJson(value) : value;
  if (!record || typeof record !== "object") return null;
  const type = "type" in record ? record.type : undefined;
  const email = "email" in record ? record.email : undefined;
  if (type !== "magic-link" || typeof email !== "string") return null;
  return email;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
