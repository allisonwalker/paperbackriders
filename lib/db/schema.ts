import { sql } from "drizzle-orm";
import { boolean, check, date, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const picks = pgTable(
  "picks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    month: date("month", { mode: "string" }).notNull().unique(),
    kind: text("kind").notNull(),
    promptText: text("prompt_text"),
    title: text("title"),
    author: text("author"),
    publishedYear: integer("published_year"),
    coverUrl: text("cover_url"),
    pageCount: integer("page_count"),
    genre: text("genre"),
    lookupSource: text("lookup_source"),
    lookupKey: text("lookup_key"),
  },
  () => [
    check("picks_month_is_first_day", sql`extract(day from "month") = 1`),
    check(
      "picks_book_or_prompt",
      sql`(
        "kind" = 'book'
        and "prompt_text" is null
        and "title" is not null
        and btrim("title") <> ''
        and "author" is not null
        and btrim("author") <> ''
        and ("lookup_source" is null or "lookup_source" in ('open_library', 'manual'))
      ) or (
        "kind" = 'prompt'
        and "prompt_text" is not null
        and btrim("prompt_text") <> ''
        and "title" is null
        and "author" is null
        and "published_year" is null
        and "cover_url" is null
        and "page_count" is null
        and "genre" is null
        and "lookup_source" is null
        and "lookup_key" is null
      )`,
    ),
  ],
);

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pickId: uuid("pick_id")
      .notNull()
      .references(() => picks.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    place: text("place").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    singleton: boolean("singleton").notNull().default(true),
  },
  (table) => [
    unique("meetings_one_row").on(table.singleton),
    check("meetings_is_singleton", sql`${table.singleton} = true`),
    check("meetings_place_present", sql`btrim(${table.place}) <> ''`),
  ],
);
