import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { catalogCountsMatch, type CatalogCounts } from "./catalog-backup";
import { assertCatalogRestore, assertProductionImport } from "./database-isolation";

const root = path.resolve(import.meta.dirname, "..");
const productionHost = "ep-live.example.neon.tech";
const restoreHost = "ep-restore.example.neon.tech";
const secretUrl = `postgres://user:s3cret@${productionHost}/neondb`;

const empty: CatalogCounts = { picks: 0, meetings: 0, places: 0, visits: 0 };

describe("catalog restore", () => {
  test("the backup is the production catalog, and the restore is a different database", () => {
    expect(() =>
      assertCatalogRestore({
        PRODUCTION_DATABASE_HOST: "ep-live-pooler.example.neon.tech",
        CATALOG_RESTORE_HOST: `${restoreHost}:5432`,
        DATABASE_URL: "postgres://user:s3cret@ep-preview.example.neon.tech/neondb",
      }),
    ).not.toThrow();
  });

  test("preview and local hosts are not the database this backup is for", () => {
    expect(() =>
      assertProductionImport({
        DATABASE_URL: "postgres://user:s3cret@ep-preview.example.neon.tech/neondb",
        PRODUCTION_DATABASE_HOST: productionHost,
        CATALOG_RESTORE_HOST: restoreHost,
      }),
    ).toThrow("The import runs only against the production database");

    expect(() =>
      assertCatalogRestore({
        PRODUCTION_DATABASE_HOST: productionHost,
        CATALOG_RESTORE_HOST: "ep-live-pooler.example.neon.tech",
      }),
    ).toThrow("A restore must use a non-production database");
  });

  test("a production import waits until that restore is named", () => {
    expect(() =>
      assertProductionImport({
        DATABASE_URL: secretUrl,
        PRODUCTION_DATABASE_HOST: productionHost,
      }),
    ).toThrow("The production catalog has no confirmed restore");

    expect(() =>
      assertProductionImport({
        DATABASE_URL: secretUrl,
        PRODUCTION_DATABASE_HOST: productionHost,
        CATALOG_RESTORE_HOST: `postgres://user:s3cret@${restoreHost}/neondb`,
      }),
    ).not.toThrow();
  });

  test("does not echo the connection string", () => {
    const cases = [
      () => assertCatalogRestore({ PRODUCTION_DATABASE_HOST: productionHost, CATALOG_RESTORE_HOST: "not a host" }),
      () =>
        assertCatalogRestore({
          PRODUCTION_DATABASE_HOST: productionHost,
          CATALOG_RESTORE_HOST: `postgres://user:s3cret@${productionHost}/neondb`,
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

describe("restored catalog", () => {
  test("matches only when every catalog count is the same whole number", () => {
    const source: CatalogCounts = { picks: 12, meetings: 1, places: 4, visits: 9 };
    expect(catalogCountsMatch(source, { ...source })).toBe(true);
    expect(catalogCountsMatch(empty, { ...empty })).toBe(true);
    expect(catalogCountsMatch(source, { ...source, visits: 8 })).toBe(false);
    expect(catalogCountsMatch({ ...source, picks: 1.5 }, { ...source, picks: 1.5 })).toBe(false);
    expect(catalogCountsMatch({ ...source, picks: -1 }, { ...source, picks: -1 })).toBe(false);
  });
});

describe("club spreadsheet", () => {
  test("stays out of the repository", () => {
    for (const name of ["history.xlsx", "History.XLS", "venues.csv", "club.numbers", "meetings.ods"]) {
      execFileSync("git", ["check-ignore", "-q", name], { cwd: root });
    }
    const tracked = execFileSync("git", ["ls-files", "*.xlsx", "*.xls", "*.csv", "*.numbers", "*.ods"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(tracked).toBe("");
  });
});
