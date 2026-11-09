import { describe, expect, test } from "vitest";
import { createAuth } from "./auth";

describe("auth instance", () => {
  test("exposes the magic-link sign-in API", () => {
    const previousDatabase = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://127.0.0.1:1/paperbackriders";
    try {
      const auth = createAuth({
        DATABASE_URL: process.env.DATABASE_URL,
        BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
        RECORD_KEEPER_EMAIL: "keeper@example.com",
        NODE_ENV: "test",
      });

      expect(typeof auth.api.signInMagicLink).toBe("function");
      expect(typeof auth.api.getSession).toBe("function");
      expect(typeof auth.api.signOut).toBe("function");
    } finally {
      process.env.DATABASE_URL = previousDatabase;
    }
  });
});
