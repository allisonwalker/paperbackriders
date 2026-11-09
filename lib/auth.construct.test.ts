import { describe, expect, test } from "vitest";
import { createAuth } from "./auth";

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("auth instance", () => {
  test("exposes the magic-link sign-in API", () => {
    const previousDatabase = process.env.DATABASE_URL;
    const previousHost = process.env.PRODUCTION_DATABASE_HOST;
    const previousVercel = process.env.VERCEL;
    const previousVercelEnv = process.env.VERCEL_ENV;
    process.env.DATABASE_URL = "postgres://127.0.0.1:1/paperbackriders";
    process.env.PRODUCTION_DATABASE_HOST = "ep-production.example.neon.tech";
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    try {
      const auth = createAuth({
        DATABASE_URL: process.env.DATABASE_URL,
        PRODUCTION_DATABASE_HOST: process.env.PRODUCTION_DATABASE_HOST,
        BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
        RECORD_KEEPER_EMAIL: "keeper@example.com",
        NODE_ENV: "test",
      });

      expect(typeof auth.api.signInMagicLink).toBe("function");
      expect(typeof auth.api.getSession).toBe("function");
      expect(typeof auth.api.signOut).toBe("function");
    } finally {
      restoreEnv("DATABASE_URL", previousDatabase);
      restoreEnv("PRODUCTION_DATABASE_HOST", previousHost);
      restoreEnv("VERCEL", previousVercel);
      restoreEnv("VERCEL_ENV", previousVercelEnv);
    }
  });
});
