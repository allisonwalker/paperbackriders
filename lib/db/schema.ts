import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

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
    alsoTitle: text("also_title"),
    alsoAuthor: text("also_author"),
    alsoPublishedYear: integer("also_published_year"),
    alsoCoverUrl: text("also_cover_url"),
    alsoPageCount: integer("also_page_count"),
    alsoGenre: text("also_genre"),
    alsoLookupSource: text("also_lookup_source"),
    alsoLookupKey: text("also_lookup_key"),
    meetingSettled: text("meeting_settled"),
  },
  () => [
    check("picks_month_is_first_day", sql`extract(day from "month") = 1`),
    check(
      "picks_also_book",
      sql`(
        "also_title" is null
        and "also_author" is null
        and "also_published_year" is null
        and "also_cover_url" is null
        and "also_page_count" is null
        and "also_genre" is null
        and "also_lookup_source" is null
        and "also_lookup_key" is null
      ) or (
        "kind" = 'book'
        and "also_title" is not null
        and btrim("also_title") <> ''
        and "also_author" is not null
        and btrim("also_author") <> ''
        and ("also_lookup_source" is null or "also_lookup_source" in ('open_library', 'manual'))
      )`,
    ),
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
    check(
      "picks_meeting_settled",
      sql`"meeting_settled" is null or "meeting_settled" in ('skipped', 'happened')`,
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
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }),
    place: text("place"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    singleton: boolean("singleton").notNull().default(true),
  },
  (table) => [
    unique("meetings_one_row").on(table.singleton),
    check("meetings_is_singleton", sql`${table.singleton} = true`),
    check(
      "meetings_scheduled_or_unscheduled",
      sql`(
        ${table.startsAt} is not null
        and ${table.place} is not null
        and btrim(${table.place}) <> ''
      ) or (
        ${table.startsAt} is null
        and ${table.place} is null
      )`,
    ),
  ],
);

export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    provider: text("provider").notNull(),
    providerId: text("provider_id").notNull(),
  },
  (table) => [
    unique("places_provider_identity").on(table.provider, table.providerId),
    check("places_label_present", sql`btrim(${table.label}) <> ''`),
    check("places_provider_present", sql`btrim(${table.provider}) <> ''`),
    check("places_provider_id_present", sql`btrim(${table.providerId}) <> ''`),
    check("places_latitude_range", sql`${table.latitude} >= -90 and ${table.latitude} <= 90`),
    check("places_longitude_range", sql`${table.longitude} >= -180 and ${table.longitude} <= 180`),
  ],
);

export const visits = pgTable(
  "visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pickId: uuid("pick_id")
      .notNull()
      .unique()
      .references(() => picks.id, { onDelete: "cascade" }),
    enteredName: text("entered_name").notNull(),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "restrict" }),
  },
  (table) => [check("visits_entered_name_present", sql`btrim(${table.enteredName}) <> ''`)],
);
