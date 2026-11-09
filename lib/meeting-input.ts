import { isMonthStart } from "./club-date";
import { PLACE_LIMIT } from "./meeting-copy";
import { selectFeaturedPick } from "./featured-pick";
import { normalizeMonth } from "./validation";

/**
 * Date, time, place, and pick rules for the one next meeting.
 * starts_at is a UTC instant. The wall clock is America/Los_Angeles unless
 * a caller passes another IANA zone.
 */

export { PLACE_IS_PUBLIC, PLACE_LIMIT } from "./meeting-copy";

/** 6:30 PM, the usual club time. The value is a 24-hour clock for the time input. */
export const DEFAULT_MEETING_TIME = "18:30";

export type MeetingField = "date" | "time" | "place" | "pick";

export type MeetingErrors = Partial<Record<MeetingField, string>>;

export type MeetingInput = {
  date?: unknown;
  time?: unknown;
  place?: unknown;
  pickId?: unknown;
};

export type MeetingDraft = {
  pickId: string;
  startsAt: Date;
  place: string;
};

export type MeetingParse =
  | { ok: true; draft: MeetingDraft }
  | { ok: false; errors: MeetingErrors };

const CLUB_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function meetingInputFromForm(formData: FormData): MeetingInput {
  return {
    date: field(formData, "date"),
    time: field(formData, "time"),
    place: field(formData, "place"),
    pickId: field(formData, "pickId"),
  };
}

export function monthOfClubDate(date: string): string | null {
  const parts = clubDateParts(date);
  if (!parts) return null;
  return `${parts.year}-${parts.month}-01`;
}

/** The pick for the meeting's club month, or the featured pick when that month is empty. */
export function pickForMeetingMonth<T extends { id: string; month: string }>(
  rows: readonly T[],
  meetingMonth: string,
  currentMonth: string,
): T | null {
  if (!isMonthStart(meetingMonth) || !isMonthStart(currentMonth)) {
    throw new Error("A meeting month must be the first calendar day");
  }

  const own = rows.find((row) => row.month === meetingMonth);
  if (own) return own;
  return selectFeaturedPick(rows, currentMonth);
}

export function meetingFormValues(input: {
  picks: readonly { id: string; month: string }[];
  stored: { date: string; time: string; place: string; pickId: string } | null;
  today: string;
  currentMonth: string;
}): { date: string; time: string; place: string; pickId: string | null } {
  const date = input.stored?.date ?? input.today;
  const meetingMonth = monthOfClubDate(date);
  if (!meetingMonth || !monthOfClubDate(input.today) || !isMonthStart(input.currentMonth)) {
    throw new Error("The meeting form needs a club date");
  }

  const fallback = pickForMeetingMonth(input.picks, meetingMonth, input.currentMonth);
  const storedId = input.stored?.pickId ?? null;
  const storedStillThere = storedId !== null && input.picks.some((pick) => pick.id === storedId);
  const pickId = input.stored
    ? storedStillThere
      ? storedId
      : (fallback?.id ?? null)
    : (fallback?.id ?? null);

  return {
    date,
    time: input.stored?.time ?? DEFAULT_MEETING_TIME,
    place: input.stored?.place ?? "",
    pickId,
  };
}

export function meetingSavedHref(returnMonth: unknown): string {
  const month = normalizeMonth(returnMonth);
  const query = new URLSearchParams({ tab: "meeting", meeting: "1" });
  if (month) query.set("month", month);
  return `/edit?${query.toString()}`;
}

export function clubDateAndTime(instant: Date, timeZone: string): { date: string; time: string } {
  const parts = wallClock(instant, timeZone);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function parseMeetingInput(input: MeetingInput, timeZone: string): MeetingParse {
  const errors: MeetingErrors = {};
  const date = typeof input.date === "string" ? input.date.trim() : "";
  const time = typeof input.time === "string" ? normalizeClock(input.time) : null;
  const place = typeof input.place === "string" ? input.place.trim() : "";
  const pickId = typeof input.pickId === "string" ? input.pickId.trim() : "";

  if (!date || !monthOfClubDate(date)) errors.date = "Choose a date.";
  if (!time) errors.time = "Choose a time.";
  if (!place) errors.place = "Write a place.";
  else if (place.length > PLACE_LIMIT) errors.place = "The place is too long.";
  if (!pickId) errors.pick = "Choose a pick.";

  if (errors.date || errors.time || errors.place || errors.pick) {
    return { ok: false, errors };
  }

  const startsAt = clubDateTimeToUtc(date, time as string, timeZone);
  if (!startsAt) {
    return { ok: false, errors: { ...errors, time: "That time does not exist on that date." } };
  }

  return { ok: true, draft: { pickId, startsAt, place } };
}

/** A wall-clock date and time in `timeZone`, as a UTC instant. A skipped hour is rejected. */
export function clubDateTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const day = clubDateParts(date);
  const clock = CLOCK_TIME.exec(time);
  if (!day || !clock || clock[3]) return null;

  const hour = Number(clock[1]);
  const minute = Number(clock[2]);
  if (hour > 23 || minute > 59) return null;

  const guess = Date.UTC(Number(day.year), Number(day.month) - 1, Number(day.day), hour, minute, 0);
  const first = new Date(guess - zoneOffsetMs(new Date(guess), timeZone));
  if (sameWallClock(first, timeZone, day, hour, minute)) return first;

  const second = new Date(guess - zoneOffsetMs(first, timeZone));
  if (sameWallClock(second, timeZone, day, hour, minute)) return second;
  return null;
}

function normalizeClock(value: string): string | null {
  const match = CLOCK_TIME.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] ? Number(match[3]) : 0;
  if (hour > 23 || minute > 59 || second !== 0) return null;
  return `${match[1]}:${match[2]}`;
}

function clubDateParts(date: string): { year: string; month: string; day: string } | null {
  const match = CLUB_DATE.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    return null;
  }
  return { year: match[1], month: match[2], day: match[3] };
}

function sameWallClock(
  instant: Date,
  timeZone: string,
  day: { year: string; month: string; day: string },
  hour: number,
  minute: number,
): boolean {
  const parts = wallClock(instant, timeZone);
  return (
    parts.year === day.year &&
    parts.month === day.month &&
    parts.day === day.day &&
    Number(parts.hour) === hour &&
    Number(parts.minute) === minute
  );
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = wallClock(instant, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

function wallClock(instant: Date, timeZone: string): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
} {
  if (Number.isNaN(instant.getTime())) {
    throw new Error("A meeting time must be a real instant");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = read("year");
  const month = read("month");
  const day = read("day");
  let hour = read("hour");
  const minute = read("minute");
  const second = read("second");
  if (!year || !month || !day || hour == null || !minute || !second) {
    throw new Error("Could not read the club calendar");
  }
  if (hour === "24") hour = "00";

  return { year, month, day, hour, minute, second };
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
