import { and, eq, isNull } from "drizzle-orm";
import { clubCalendarDate, clubTimeZone } from "./club-date";
import type { CurrentMeeting } from "./current-pick";
import { getDb } from "./db/client";
import { meetings, picks } from "./db/schema";

/** Remember that an organized meeting's date has passed, before that row is replaced. */
export async function rememberHappenedMeeting(now = new Date(), timeZone = clubTimeZone()): Promise<void> {
  const rows = await getDb().select().from(meetings).limit(2);
  if (rows.length > 1) {
    throw new Error("More than one meeting row is stored");
  }
  const meeting = rows[0];
  if (!meeting?.startsAt) return;

  const today = clubCalendarDate(now, timeZone);
  const meetingDay = clubCalendarDate(meeting.startsAt, timeZone);
  if (meetingDay >= today) return;

  await getDb()
    .update(picks)
    .set({ meetingSettled: "happened" })
    .where(and(eq(picks.id, meeting.pickId), isNull(picks.meetingSettled)));
}

export async function loadMeetingAnchor(now = new Date(), timeZone = clubTimeZone()): Promise<CurrentMeeting | null> {
  const rows = await getDb().select({ pickId: meetings.pickId, startsAt: meetings.startsAt }).from(meetings).limit(2);
  if (rows.length > 1) {
    throw new Error("More than one meeting row is stored");
  }
  const meeting = rows[0];
  if (!meeting) return null;
  return {
    pickId: meeting.pickId,
    meetingDay: meeting.startsAt ? clubCalendarDate(meeting.startsAt, timeZone) : null,
  };
}
