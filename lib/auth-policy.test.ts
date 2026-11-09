import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { getCookies } from "better-auth/cookies";
import type { BetterAuthOptions } from "better-auth";
import { describe, expect, test } from "vitest";
import {
  CLOSED_AUTH_PATHS,
  allowUserCreate,
  allowUserUpdate,
  allowVerificationCreate,
  assertServerOnlyAuthEnv,
  REQUEST_HOSTS,
  authBaseURL,
  authSecurityOptions,
  isRecordKeeperEmail,
  redactAuthText,
  requireAuthSecret,
  resolveAuthBaseURL,
  sessionCookieAttributes,
} from "./auth-policy";

const keeper = "Keeper@Example.com";

describe("record keeper allowlist", () => {
  test("matches only the allowlisted address, ignoring case and surrounding space", () => {
    expect(isRecordKeeperEmail("  keeper@example.com ", keeper)).toBe(true);
    expect(isRecordKeeperEmail("someone@example.com", keeper)).toBe(false);
    expect(isRecordKeeperEmail("", keeper)).toBe(false);
    expect(isRecordKeeperEmail("keeper@example.com", "  ")).toBe(false);
    expect(isRecordKeeperEmail("keeper@example.com", undefined)).toBe(false);
  });

  test("creates a user only for the allowlisted address", () => {
    expect(allowUserCreate({ email: "keeper@example.com" }, keeper)).toBe(true);
    expect(allowUserCreate({ email: "member@example.com" }, keeper)).toBe(false);
    expect(allowUserCreate({}, keeper)).toBe(false);
  });

  test("refuses an update that changes the email away from the allowlist", () => {
    expect(allowUserUpdate({}, keeper)).toBe(true);
    expect(allowUserUpdate({ email: "keeper@example.com" }, keeper)).toBe(true);
    expect(allowUserUpdate({ email: "other@example.com" }, keeper)).toBe(false);
  });

  test("stores a magic link verification only for the allowlisted address", () => {
    const value = JSON.stringify({ type: "magic-link", email: "keeper@example.com" });
    expect(allowVerificationCreate({ identifier: "magic-link:hashed", value }, keeper)).toBe(true);
    expect(
      allowVerificationCreate(
        { identifier: "magic-link:hashed", value: JSON.stringify({ type: "magic-link", email: "other@example.com" }) },
        keeper,
      ),
    ).toBe(false);
    expect(allowVerificationCreate({ identifier: "email-verification:token", value: "{}" }, keeper)).toBe(false);
    expect(allowVerificationCreate({ identifier: "magic-link:hashed", value: "not-json" }, keeper)).toBe(false);
  });
});

describe("session cookie", () => {
  test("is httpOnly, Secure, and SameSite in production", () => {
    const attributes = sessionCookieAttributes("production");
    const cookies = getCookies({
      baseURL: "https://club.example",
      secret: "test-secret-test-secret-test-secret",
      advanced: {
        useSecureCookies: true,
        defaultCookieAttributes: attributes,
        crossSubDomainCookies: { enabled: false },
      },
      session: { cookieCache: { enabled: false } },
    } as BetterAuthOptions);

    expect(attributes).toEqual({ httpOnly: true, secure: true, sameSite: "lax" });
    expect(cookies.sessionToken.attributes.httpOnly).toBe(true);
    expect(cookies.sessionToken.attributes.secure).toBe(true);
    expect(cookies.sessionToken.attributes.sameSite).toBe("lax");
    expect(cookies.sessionToken.name.startsWith("__Secure-")).toBe(true);
    expect(cookies.sessionToken.attributes.domain).toBeUndefined();
  });

  test("stays httpOnly on local http without the Secure prefix", () => {
    const cookies = getCookies({
      secret: "test-secret-test-secret-test-secret",
      advanced: {
        useSecureCookies: false,
        defaultCookieAttributes: sessionCookieAttributes("development"),
      },
    } as BetterAuthOptions);

    expect(cookies.sessionToken.attributes.httpOnly).toBe(true);
    expect(cookies.sessionToken.attributes.secure).toBe(false);
    expect(cookies.sessionToken.attributes.sameSite).toBe("lax");
    expect(cookies.sessionToken.name.startsWith("__Secure-")).toBe(false);
  });
});

describe("auth configuration", () => {
  test("turns password sign-up off and does not cache the session away from Postgres", () => {
    const security = authSecurityOptions({
      NODE_ENV: "production",
      VERCEL: "1",
      VERCEL_ENV: "production",
      BETTER_AUTH_URL: "https://club.example",
    });
    expect(security.baseURL).toBe("https://club.example");
    expect(security.emailAndPassword).toEqual({ enabled: false, disableSignUp: true });
    expect(security.session.cookieCache.enabled).toBe(false);
    expect(security.advanced.crossSubDomainCookies.enabled).toBe(false);
    expect(security.advanced.useSecureCookies).toBe(true);
    expect(CLOSED_AUTH_PATHS).toContain("/sign-up/email");
    expect(CLOSED_AUTH_PATHS).toContain("/sign-in/email");
  });

  test("uses BETTER_AUTH_URL only on the production deployment", () => {
    expect(
      resolveAuthBaseURL({
        VERCEL: "1",
        VERCEL_ENV: "production",
        BETTER_AUTH_URL: " https://club.example ",
      }),
    ).toBe("https://club.example");
    expect(
      resolveAuthBaseURL({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        BETTER_AUTH_URL: "https://club.example",
        VERCEL_URL: "preview.vercel.app",
      }),
    ).toBeUndefined();
    expect(
      resolveAuthBaseURL({
        BETTER_AUTH_URL: "https://club.example",
        VERCEL_URL: "preview.vercel.app",
        NEXT_PUBLIC_BETTER_AUTH_URL: "https://club.example",
        BASE_URL: "https://club.example",
      }),
    ).toBeUndefined();
  });

  test("reads the request host when preview has no auth URL, or one copied from production", () => {
    const requestHost = {
      allowedHosts: [...REQUEST_HOSTS],
      protocol: "auto" as const,
    };
    expect(
      authBaseURL({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        VERCEL_URL: "preview.vercel.app",
        BASE_URL: "https://club.example",
      }),
    ).toEqual(requestHost);
    expect(
      authBaseURL({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        BETTER_AUTH_URL: "https://club.example",
      }),
    ).toEqual(requestHost);
  });

  test("rejects public auth env and a BASE_URL standing in for an unset auth URL", () => {
    expect(() => assertServerOnlyAuthEnv({ NEXT_PUBLIC_DATABASE_URL: "postgres://db.example/app" })).toThrow(
      /NEXT_PUBLIC_DATABASE_URL/,
    );
    expect(() => assertServerOnlyAuthEnv({ BASE_URL: "https://club.example" })).toThrow(/BASE_URL/);
    expect(() =>
      assertServerOnlyAuthEnv({ BETTER_AUTH_URL: "https://club.example", BASE_URL: "https://other.example" }),
    ).not.toThrow();
  });

  test("refuses to start without a secret and does not echo one", () => {
    expect(() => requireAuthSecret({})).toThrow("BETTER_AUTH_SECRET is not set");
    const secret = "super-secret-value";
    expect(requireAuthSecret({ BETTER_AUTH_SECRET: secret })).toBe(secret);
    try {
      requireAuthSecret({ BETTER_AUTH_SECRET: "" });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(secret);
    }
  });
});

describe("logs", () => {
  test("redacts the magic link, the session token, the auth secret, and the database URL", () => {
    const secret = "auth-secret-value";
    const databaseUrl = "postgres://user:password@db.example/paperback";
    const apiKey = "resend-api-key-value";
    const link = "https://club.example/api/auth/magic-link/verify?token=session-token-value&callbackURL=%2Fedit";
    const text = redactAuthText(
      `failed ${link} bearer ${secret} db ${databaseUrl} key ${apiKey} Authorization: Bearer ${apiKey}`,
      [secret, databaseUrl, apiKey],
    );

    expect(text).not.toContain(secret);
    expect(text).not.toContain(databaseUrl);
    expect(text).not.toContain(apiKey);
    expect(text).not.toContain("session-token-value");
    expect(text).not.toContain("magic-link/verify");
    expect(text).toContain("[redacted]");
  });
});

describe("server-only env in the repo", () => {
  test("does not publish auth secrets or point preview at VERCEL_URL", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const files = sourceFiles(root);

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/process\.env\.NEXT_PUBLIC_/);
      expect(source, file).not.toMatch(/NEXT_PUBLIC_[A-Z0-9_]+\s*=/);
    }

    const authSource = readFileSync(path.join(root, "lib/auth.ts"), "utf8");
    expect(authSource).not.toContain("VERCEL_URL");
    expect(authSource).toContain('provider: "pg"');
    expect(authSource).toContain("nextCookies()");
    const plugins = authSource.slice(authSource.indexOf("plugins: ["));
    expect(plugins.indexOf("magicLink(")).toBeLessThan(plugins.indexOf("nextCookies()"));

    const example = readFileSync(path.join(root, ".env.example"), "utf8");
    expect(example).toContain("BETTER_AUTH_URL=");
    expect(example).not.toContain("NEXT_PUBLIC_");
    expect(example).not.toContain("VERCEL_URL");
  });
});

function sourceFiles(root: string): string[] {
  const found: string[] = [];
  for (const directory of ["app", "lib"]) {
    walk(path.join(root, directory), found);
  }
  found.push(path.join(root, ".env.example"), path.join(root, "next.config.ts"), path.join(root, "vercel.ts"));
  return found;
}

function walk(directory: string, found: string[]) {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      walk(full, found);
      continue;
    }
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    if (/\.(ts|tsx|css)$/.test(entry)) found.push(full);
  }
}
