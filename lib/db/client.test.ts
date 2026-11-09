import { afterEach, describe, expect, test, vi } from "vitest";

const envKeys = ["DATABASE_URL", "PRODUCTION_DATABASE_HOST", "VERCEL", "VERCEL_ENV"] as const;
const previous: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

for (const key of envKeys) previous[key] = process.env[key];

afterEach(() => {
  for (const key of envKeys) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  vi.doUnmock("postgres");
});

describe("getDb", () => {
  test("does not open a client when preview points at production", async () => {
    vi.resetModules();
    const postgres = vi.fn(() => ({}));
    vi.doMock("postgres", () => ({ default: postgres }));
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "preview";
    process.env.DATABASE_URL = "postgres://user:s3cret@ep-live.example.neon.tech/neondb";
    process.env.PRODUCTION_DATABASE_HOST = "ep-live-pooler.example.neon.tech";

    const { getDb } = await import("./client");
    let message = "";
    expect(() => {
      try {
        getDb();
      } catch (error) {
        message = error instanceof Error ? error.message : "";
        throw error;
      }
    }).toThrow("This environment must not use the production database");
    expect(postgres).not.toHaveBeenCalled();
    expect(message).not.toContain("s3cret");
    expect(message).not.toContain("ep-live");
  });
});
