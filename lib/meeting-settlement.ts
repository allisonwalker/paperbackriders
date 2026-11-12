import { and, eq, isNull } from "drizzle-orm";
import { clubCalendarDate, clubTimeZone } from "./club-date";
import type { CurrentMeeting } from "./current-pick";
import { getDb } from "./db/client";
import { meetings, picks } from "./db/schema";

export type HappenedMeetingRow = {
  pickId: string;
  startsAt: Date | null;
};

export type HappenedPick = {
  id: string;
  meetingSettled: string | null;
};

export type HappenedStore = {
  listMeetings(): Promise<HappenedMeetingRow[]>;
  findPick(id: string): Promise<HappenedPick | null>;
  markHappened(pickId: string): Promise<void>;
};

/** Remember that an organized meeting's date has passed, before that row is replaced. */
export async function rememberHappenedMeeting(
  now = new Date(),
  timeZone = clubTimeZone(),
  store: HappenedStore = defaultHappenedStore(),
): Promise<void> {
  const rows = await store.listMeetings();
  if (rows.length > 1) {
    throw new Error("More than one meeting row is stored");
  }
  const meeting = rows[0];
  if (!meeting?.startsAt) return;

  const today = clubCalendarDate(now, timeZone);
  const meetingDay = clubCalendarDate(meeting.startsAt, timeZone);
  if (meetingDay >= today) return;

  const pick = await store.findPick(meeting.pickId);
  if (!pick || pick.meetingSettled !== null) return;

  await store.markHappened(meeting.pickId);
}

function defaultHappenedStore(): HappenedStore {
  return {
    async listMeetings() {
      return getDb().select({ pickId: meetings.pickId, startsAt: meetings.startsAt }).from(meetings).limit(2);
    },
    async findPick(id) {
      const rows = await getDb()
        .select({ id: picks.id, meetingSettled: picks.meetingSettled })
        .from(picks)
        .where(eq(picks.id, id))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return { id: row.id, meetingSettled: row.meetingSettled };
    },
    async markHappened(pickId) {
      await getDb()
        .update(picks)
        .set({ meetingSettled: "happened" })
        .where(and(eq(picks.id, pickId), isNull(picks.meetingSettled)));
    },
  };
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
