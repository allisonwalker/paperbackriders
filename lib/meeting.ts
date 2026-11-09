import { eq } from "drizzle-orm";
import { calendarDaysUntil, clubCalendarDate, clubTimeZone } from "./club-date";
import { getDb } from "./db/client";
import { meetings, picks } from "./db/schema";
import { clubDateAndTime } from "./meeting-input";
import { mapPickRow, type PickRecord } from "./picks";

export const NO_UPCOMING_MEETING = "No upcoming meeting is set.";

export type MeetingSource = {
  id: string;
  startsAt: Date;
  place: string;
  pick: PickRecord;
};

export type MeetingView =
  | { status: "none" }
  | {
      status: "upcoming";
      daysRemaining: number;
      lead: string;
      dateLabel: string;
      timeLabel: string;
      place: string;
      discussing: string;
    };

export type MeetingResult = MeetingView | { status: "error" };

export type EditorMeetingState =
  | { status: "empty" }
  | { status: "error" }
  | { status: "set"; date: string; time: string; place: string; pickId: string };

export function meetingLead(daysRemaining: number): string {
  if (!Number.isInteger(daysRemaining) || daysRemaining < 0) {
    throw new Error("Days remaining are a calendar count from today");
  }
  if (daysRemaining === 0) {
    return "Meets today";
  }
  if (daysRemaining === 1) {
    return "Meets in 1 day";
  }
  return `Meets in ${daysRemaining} days`;
}

export function discussPick(pick: PickRecord): string {
  if (pick.kind === "prompt") {
    const promptText = trimToNull(pick.promptText);
    if (!promptText) {
      throw new Error(`Pick ${pick.id} is missing its prompt text`);
    }
    return promptText;
  }

  const title = trimToNull(pick.title);
  const author = trimToNull(pick.author);
  if (!title || !author) {
    throw new Error(`Pick ${pick.id} is missing its title or author`);
  }
  return `${title} by ${author}`;
}

export function presentMeeting(source: MeetingSource | null, now: Date, timeZone: string): MeetingView {
  if (!source) {
    return { status: "none" };
  }

  const today = clubCalendarDate(now, timeZone);
  const meetingDay = clubCalendarDate(source.startsAt, timeZone);
  const daysRemaining = calendarDaysUntil(meetingDay, today);
  if (daysRemaining < 0) {
    return { status: "none" };
  }

  const place = source.place.trim();
  if (!place) {
    throw new Error(`Meeting ${source.id} is missing its place`);
  }

  return {
    status: "upcoming",
    daysRemaining,
    lead: meetingLead(daysRemaining),
    dateLabel: formatClubWhen(source.startsAt, timeZone, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    timeLabel: formatClubWhen(source.startsAt, timeZone, {
      hour: "numeric",
      minute: "2-digit",
    }),
    place,
    discussing: discussPick(source.pick),
  };
}

export async function loadNextMeeting(options?: {
  now?: Date;
  timeZone?: string;
  loadRow?: () => Promise<MeetingSource | null>;
}): Promise<MeetingResult> {
  try {
    const now = options?.now ?? new Date();
    const timeZone = options?.timeZone ?? clubTimeZone();
    const source = await (options?.loadRow ?? loadMeetingRow)();
    return presentMeeting(source, now, timeZone);
  } catch (error) {
    logMeetingFailure(error);
    return { status: "error" };
  }
}

export async function loadEditorMeeting(options?: {
  timeZone?: string;
  loadRow?: () => Promise<MeetingSource | null>;
}): Promise<EditorMeetingState> {
  try {
    const timeZone = options?.timeZone ?? clubTimeZone();
    const source = await (options?.loadRow ?? loadMeetingRow)();
    if (!source) return { status: "empty" };

    const when = clubDateAndTime(source.startsAt, timeZone);
    const place = source.place.trim();
    if (!place) throw new Error(`Meeting ${source.id} is missing its place`);

    return { status: "set", date: when.date, time: when.time, place, pickId: source.pick.id };
  } catch (error) {
    logMeetingFailure(error);
    return { status: "error" };
  }
}

// A past meeting stays stored. The page hides it. Nothing deletes it on a schedule.
async function loadMeetingRow(): Promise<MeetingSource | null> {
  const rows = await getDb().select().from(meetings).limit(2);
  if (rows.length > 1) {
    throw new Error("More than one meeting row is stored");
  }

  const meeting = rows[0];
  if (!meeting) {
    return null;
  }

  const pickRows = await getDb().select().from(picks).where(eq(picks.id, meeting.pickId)).limit(1);
  const pick = pickRows[0];
  if (!pick) {
    throw new Error(`Meeting ${meeting.id} does not point at a pick`);
  }

  return {
    id: meeting.id,
    startsAt: meeting.startsAt,
    place: meeting.place,
    pick: mapPickRow(pick),
  };
}

function formatClubWhen(instant: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(instant).replaceAll("\u202f", " ");
}

function trimToNull(value: string | null): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function logMeetingFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  const meetingId = /Meeting ([0-9a-f-]+)/i.exec(message)?.[1];
  const pickId = /Pick ([0-9a-f-]+)/i.exec(message)?.[1];
  const exposesSecret = /postgres(ql)?:\/\//i.test(message) || message.includes("DATABASE_URL");

  if (exposesSecret) {
    console.error("next meeting query failed", meetingId || pickId ? { meetingId, pickId } : "");
    return;
  }

  console.error("next meeting query failed", { meetingId, pickId, message });
}
