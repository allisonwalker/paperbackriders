export const CLUB_TIMEZONE = "America/Los_Angeles";

const MONTH_START = /^(\d{4})-(\d{2})-01$/;

export function clubTimeZone(configured = process.env.CLUB_TIMEZONE): string {
  const value = configured?.trim();
  return value && value.length > 0 ? value : CLUB_TIMEZONE;
}

export function clubMonthStart(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  if (!year || !month) {
    throw new Error("Could not read the club calendar");
  }

  return `${year}-${month}-01`;
}

export function isMonthStart(month: string): boolean {
  return MONTH_START.test(month);
}

export function formatClubMonth(month: string): string {
  const match = MONTH_START.exec(month);
  if (!match) {
    throw new Error("A pick month must be the first calendar day of that month");
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  const date = new Date(Date.UTC(year, monthIndex - 1, 1, 12));

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function clubPickLabel(month: string): string {
  const formatted = formatClubMonth(month);
  const monthName = formatted.slice(0, formatted.lastIndexOf(" "));
  return `${monthName}\u2019s pick`;
}

const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function clubCalendarDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not read the club calendar");
  }

  return `${year}-${month}-${day}`;
}

export function calendarDaysUntil(meetingDate: string, today: string): number {
  return Math.round((calendarDayUtc(meetingDate) - calendarDayUtc(today)) / DAY_MS);
}

function calendarDayUtc(value: string): number {
  const match = CALENDAR_DAY.exec(value);
  if (!match) {
    throw new Error("A club calendar date must be YYYY-MM-DD");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);

  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error("A club calendar date must be a real day");
  }

  return utc;
}
