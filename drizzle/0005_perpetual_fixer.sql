ALTER TABLE "picks" ADD COLUMN "also_title" text;--> statement-breakpoint
ALTER TABLE "picks" ADD COLUMN "also_author" text;--> statement-breakpoint
ALTER TABLE "picks" ADD COLUMN "also_published_year" integer;--> statement-breakpoint
ALTER TABLE "picks" ADD COLUMN "also_cover_url" text;--> statement-breakpoint
ALTER TABLE "picks" ADD COLUMN "also_page_count" integer;--> statement-breakpoint
ALTER TABLE "picks" ADD COLUMN "also_genre" text;--> statement-breakpoint
ALTER TABLE "picks" ADD COLUMN "also_lookup_source" text;--> statement-breakpoint
ALTER TABLE "picks" ADD COLUMN "also_lookup_key" text;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_also_book" CHECK ((
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
      ));