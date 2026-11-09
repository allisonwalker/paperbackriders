CREATE TABLE "picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" date NOT NULL,
	"kind" text NOT NULL,
	"prompt_text" text,
	"title" text,
	"author" text,
	"published_year" integer,
	"cover_url" text,
	"page_count" integer,
	"genre" text,
	"lookup_source" text,
	"lookup_key" text,
	CONSTRAINT "picks_month_unique" UNIQUE("month"),
	CONSTRAINT "picks_month_is_first_day" CHECK (extract(day from "month") = 1),
	CONSTRAINT "picks_book_or_prompt" CHECK ((
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
      ))
);
