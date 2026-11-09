import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assertProductionImport, assertRuntimeDatabase, deploymentTarget } from "./database-isolation";

const root = path.resolve(import.meta.dirname, "..");
const productionHost = "ep-live.example.neon.tech";
const previewHost = "ep-preview.example.neon.tech";
const secretUrl = `postgres://user:s3cret@${productionHost}/neondb`;
const previewUrl = `postgres://user:s3cret@${previewHost}/neondb`;

describe("deployment target", () => {
  test("counts only a Vercel production deployment as production", () => {
    expect(deploymentTarget({ VERCEL: "1", VERCEL_ENV: "production", NODE_ENV: "production" })).toBe("production");
    expect(deploymentTarget({ VERCEL: "1", VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe("preview");
    expect(deploymentTarget({ VERCEL: "1", VERCEL_ENV: "development" })).toBe("development");
    expect(deploymentTarget({ VERCEL_ENV: "production" })).toBe("development");
    expect(deploymentTarget({})).toBe("development");
  });
});

describe("runtime database", () => {
  test("lets production open the production database", () => {
    expect(
      assertRuntimeDatabase({
        VERCEL: "1",
        VERCEL_ENV: "production",
        DATABASE_URL: `  ${secretUrl}  `,
      }),
    ).toBe(secretUrl);
  });

  test("preview and local refuse the production host, including the pooler", () => {
    for (const env of [
      { VERCEL: "1", VERCEL_ENV: "preview" },
      { VERCEL: "1", VERCEL_ENV: "development" },
      {},
      { VERCEL_ENV: "production" },
    ]) {
      expect(() =>
        assertRuntimeDatabase({
          ...env,
          DATABASE_URL: secretUrl,
          PRODUCTION_DATABASE_HOST: "ep-live-pooler.example.neon.tech",
        }),
      ).toThrow("This environment must not use the production database");
    }
  });

  test("preview and local may open a different database", () => {
    expect(
      assertRuntimeDatabase({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        DATABASE_URL: previewUrl,
        PRODUCTION_DATABASE_HOST: `postgres://ignored:s3cret@${productionHost}/neondb`,
      }),
    ).toBe(previewUrl);
    expect(
      assertRuntimeDatabase({
        DATABASE_URL: "postgres://127.0.0.1:5432/paperbackriders",
        PRODUCTION_DATABASE_HOST: `${productionHost}:5432`,
      }),
    ).toBe("postgres://127.0.0.1:5432/paperbackriders");
  });

  test("fails closed when the production host is missing outside production", () => {
    expect(() => assertRuntimeDatabase({ VERCEL: "1", VERCEL_ENV: "preview", DATABASE_URL: previewUrl })).toThrow(
      "PRODUCTION_DATABASE_HOST is not set",
    );
    expect(() => assertRuntimeDatabase({ DATABASE_URL: previewUrl })).toThrow("PRODUCTION_DATABASE_HOST is not set");
  });

  test("does not echo the connection string", () => {
    const cases = [
      () => assertRuntimeDatabase({ DATABASE_URL: "postgres://user:s3cret@" }),
      () => assertRuntimeDatabase({ DATABASE_URL: secretUrl, PRODUCTION_DATABASE_HOST: "not a host" }),
      () =>
        assertRuntimeDatabase({
          VERCEL: "1",
          VERCEL_ENV: "preview",
          DATABASE_URL: secretUrl,
          PRODUCTION_DATABASE_HOST: productionHost,
        }),
    ];

    for (const run of cases) {
      let thrown: unknown;
      try {
        run();
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).not.toContain("s3cret");
      expect(message).not.toContain(productionHost);
      expect(message).not.toContain("postgres://");
    }
  });
});

describe("production import", () => {
  test("allows a local run against the production host only", () => {
    expect(() =>
      assertProductionImport({
        DATABASE_URL: secretUrl,
        PRODUCTION_DATABASE_HOST: "ep-live-pooler.example.neon.tech",
        CATALOG_RESTORE_HOST: "ep-restore.example.neon.tech",
      }),
    ).not.toThrow();
  });

  test("refuses a local database, a preview, and a deployment", () => {
    expect(() =>
      assertProductionImport({
        DATABASE_URL: previewUrl,
        PRODUCTION_DATABASE_HOST: productionHost,
      }),
    ).toThrow("The import runs only against the production database");

    expect(() =>
      assertProductionImport({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        DATABASE_URL: secretUrl,
        PRODUCTION_DATABASE_HOST: productionHost,
      }),
    ).toThrow("The import does not run on a deployment");

    expect(() =>
      assertProductionImport({
        VERCEL: "1",
        VERCEL_ENV: "production",
        DATABASE_URL: secretUrl,
        PRODUCTION_DATABASE_HOST: productionHost,
      }),
    ).toThrow("The import does not run on a deployment");
  });
});

describe("writes share the runtime check", () => {
  test("opening the database is the gate for a pick or meeting save", () => {
    const client = readFileSync(path.join(root, "lib/db/client.ts"), "utf8");
    expect(client).toContain("assertRuntimeDatabase(process.env)");
    for (const file of ["lib/pick-records.ts", "lib/meeting-records.ts"]) {
      expect(readFileSync(path.join(root, file), "utf8")).toContain("getDb(");
    }
  });
});
