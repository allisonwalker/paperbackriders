CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pick_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"place" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	CONSTRAINT "meetings_one_row" UNIQUE("singleton"),
	CONSTRAINT "meetings_is_singleton" CHECK ("meetings"."singleton" = true),
	CONSTRAINT "meetings_place_present" CHECK (btrim("meetings"."place") <> '')
);
--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_pick_id_picks_id_fk" FOREIGN KEY ("pick_id") REFERENCES "public"."picks"("id") ON DELETE restrict ON UPDATE no action;