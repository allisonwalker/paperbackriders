ALTER TABLE "meetings" DROP CONSTRAINT "meetings_place_present";--> statement-breakpoint
ALTER TABLE "meetings" ALTER COLUMN "starts_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ALTER COLUMN "place" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "picks" ADD COLUMN "meeting_settled" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_scheduled_or_unscheduled" CHECK ((
        "meetings"."starts_at" is not null
        and "meetings"."place" is not null
        and btrim("meetings"."place") <> ''
      ) or (
        "meetings"."starts_at" is null
        and "meetings"."place" is null
      ));--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_meeting_settled" CHECK ("meeting_settled" is null or "meeting_settled" in ('skipped', 'happened'));