import { readFileSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";
import * as schema from "./schema";
import { meetings, picks, places, visits } from "./schema";

describe("pick table", () => {
  test("is a pick table and has no current-pick flag", () => {
    expect(Object.keys(schema)).toEqual(["picks", "meetings", "places", "visits"]);
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
    expect(shape?.sql).toContain("lookup_source");
    expect(shape?.sql).toContain("lookup_key");
    expect(shape?.sql).toContain("'manual'");
    expect(shape?.sql).toContain("'open_library'");
    expect(shape?.sql).toContain("prompt_text\" is null");
    expect(shape?.sql).toContain("title\" is null");
  });

  test("the page stays on the Node.js runtime and does not check a session", () => {
    const source = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
    expect(source).toContain('export const runtime = "nodejs"');
    expect(source).toContain("loadNextMeeting");
    expect(source).not.toMatch(/better-auth|requireRecordKeeper|cookies\(/);
    expect(source).not.toMatch(/openlibrary\.org\/search/);
    expect(source).not.toMatch(/\.delete\(/);
  });
});

describe("meeting table", () => {
  test("stores one meeting that points at a pick", () => {
    expect(getTableName(meetings)).toBe("meetings");
    expect(Object.keys(getTableColumns(meetings))).toEqual([
      "id",
      "pickId",
      "startsAt",
      "place",
      "updatedAt",
      "singleton",
    ]);

    const dialect = new PgDialect();
    const config = getTableConfig(meetings);
    const checks = config.checks.map((constraint) => dialect.sqlToQuery(constraint.value).sql);
    const uniques = config.uniqueConstraints.map((constraint) => constraint.name);
    const foreignKey = config.foreignKeys[0];

    expect(foreignKey).toBeDefined();
    expect(foreignKey?.onDelete).toBe("restrict");
    expect(checks.join("\n")).toContain("singleton");
    expect(checks.join("\n")).toContain("btrim");
    expect(uniques).toContain("meetings_one_row");
    expect(Object.keys(getTableColumns(meetings)).join(" ")).not.toMatch(/phone|email|latitude|longitude/i);
  });
});

describe("place and visit tables", () => {
  test("stores one confirmed place per provider id, with real coordinates", () => {
    expect(getTableName(places)).toBe("places");
    expect(Object.keys(getTableColumns(places))).toEqual([
      "id",
      "label",
      "latitude",
      "longitude",
      "provider",
      "providerId",
    ]);

    const dialect = new PgDialect();
    const config = getTableConfig(places);
    const checks = config.checks.map((constraint) => ({
      name: constraint.name,
      sql: dialect.sqlToQuery(constraint.value).sql,
    }));
    const uniques = config.uniqueConstraints.map((constraint) => constraint.columns.map((column) => column.name).join(","));

    expect(checks.find((constraint) => constraint.name === "places_latitude_range")?.sql).toContain(">=");
    expect(checks.map((constraint) => constraint.sql).join("\n")).toContain("-90");
    expect(checks.map((constraint) => constraint.sql).join("\n")).toContain("180");
    expect(checks.map((constraint) => constraint.sql).join("\n")).toContain("btrim");
    expect(uniques).toContain("provider,provider_id");
  });

  test("stores one visit per pick and leaves the place empty until it is confirmed", () => {
    expect(getTableName(visits)).toBe("visits");
    expect(Object.keys(getTableColumns(visits))).toEqual(["id", "pickId", "enteredName", "placeId"]);

    const config = getTableConfig(visits);
    const pickKey = config.foreignKeys.find((key) => key.onDelete === "cascade");
    const placeKey = config.foreignKeys.find((key) => key.onDelete === "restrict");
    const placeColumn = config.columns.find((column) => column.name === "place_id");
    const pickColumn = config.columns.find((column) => column.name === "pick_id");

    expect(pickKey?.onDelete).toBe("cascade");
    expect(placeKey?.onDelete).toBe("restrict");
    expect(placeColumn?.notNull).toBe(false);
    expect(pickColumn?.isUnique).toBe(true);
  });
});
