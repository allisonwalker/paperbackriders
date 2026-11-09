import { readFileSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";
import * as schema from "./schema";
import { picks } from "./schema";

describe("pick table", () => {
  test("is the only table and has no current-pick flag", () => {
    expect(Object.keys(schema)).toEqual(["picks"]);
    expect(getTableName(picks)).toBe("picks");

    const columns = Object.keys(getTableColumns(picks));
    expect(columns).toEqual([
      "id",
      "month",
      "kind",
      "promptText",
      "title",
      "author",
      "publishedYear",
      "coverUrl",
      "pageCount",
      "genre",
      "lookupSource",
      "lookupKey",
    ]);
    expect(columns).not.toContain("isCurrent");
    expect(columns).not.toContain("currentPick");
  });

  test("constrains a month to the first day and a row to one book or one prompt", () => {
    const dialect = new PgDialect();
    const checks = getTableConfig(picks).checks.map((constraint) => ({
      name: constraint.name,
      sql: dialect.sqlToQuery(constraint.value).sql,
    }));

    const month = checks.find((constraint) => constraint.name === "picks_month_is_first_day");
    const shape = checks.find((constraint) => constraint.name === "picks_book_or_prompt");

    expect(month?.sql).toContain("extract(day from");
    expect(shape?.sql).toContain("kind");
    expect(shape?.sql).toContain("'book'");
    expect(shape?.sql).toContain("'prompt'");
    expect(shape?.sql).toContain("prompt_text");
    expect(shape?.sql).toContain("title");
    expect(shape?.sql).toContain("author");
    expect(shape?.sql).toContain("published_year");
    expect(shape?.sql).toContain("cover_url");
    expect(shape?.sql).toContain("page_count");
    expect(shape?.sql).toContain("genre");
  });

  test("the page stays on the Node.js runtime and does not check a session", () => {
    const source = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
    expect(source).toContain('export const runtime = "nodejs"');
    expect(source).not.toMatch(/better-auth|requireRecordKeeper|cookies\(/);
    expect(source).not.toMatch(/openlibrary\.org\/search/);
  });
});
