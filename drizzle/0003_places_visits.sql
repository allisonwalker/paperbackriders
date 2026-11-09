CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text NOT NULL,
	CONSTRAINT "places_provider_identity" UNIQUE("provider","provider_id"),
	CONSTRAINT "places_label_present" CHECK (btrim("places"."label") <> ''),
	CONSTRAINT "places_provider_present" CHECK (btrim("places"."provider") <> ''),
	CONSTRAINT "places_provider_id_present" CHECK (btrim("places"."provider_id") <> ''),
	CONSTRAINT "places_latitude_range" CHECK ("places"."latitude" >= -90 and "places"."latitude" <= 90),
	CONSTRAINT "places_longitude_range" CHECK ("places"."longitude" >= -180 and "places"."longitude" <= 180)
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pick_id" uuid NOT NULL,
	"entered_name" text NOT NULL,
	"place_id" uuid,
	CONSTRAINT "visits_pick_id_unique" UNIQUE("pick_id"),
	CONSTRAINT "visits_entered_name_present" CHECK (btrim("visits"."entered_name") <> '')
);
--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_pick_id_picks_id_fk" FOREIGN KEY ("pick_id") REFERENCES "public"."picks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;