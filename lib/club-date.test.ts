import { describe, expect, test } from "vitest";
import {
  CLUB_TIMEZONE,
  calendarDaysUntil,
  clubCalendarDate,
  clubMonthStart,
  clubPickLabel,
  clubTimeZone,
  formatClubMonth,
} from "./club-date";

describe("club timezone", () => {
  test("defaults to America/Los_Angeles", () => {
    expect(CLUB_TIMEZONE).toBe("America/Los_Angeles");
    expect(clubTimeZone("")).toBe("America/Los_Angeles");
    expect(clubTimeZone("  ")).toBe("America/Los_Angeles");
  });

  test("reads CLUB_TIMEZONE when it is set", () => {
    expect(clubTimeZone("America/Los_Angeles")).toBe("America/Los_Angeles");
  });
});

describe("club month", () => {
  test("uses the first calendar day in the club timezone", () => {
    expect(clubMonthStart(new Date("2026-06-15T20:00:00.000Z"), CLUB_TIMEZONE)).toBe("2026-06-01");
  });

  test("stays in February until midnight Pacific on 1 March", () => {
    expect(clubMonthStart(new Date("2026-03-01T07:59:00.000Z"), CLUB_TIMEZONE)).toBe("2026-02-01");
    expect(clubMonthStart(new Date("2026-03-01T08:00:00.000Z"), CLUB_TIMEZONE)).toBe("2026-03-01");
  });

  test("stays in October until midnight Pacific on 1 November", () => {
    expect(clubMonthStart(new Date("2026-11-01T06:59:00.000Z"), CLUB_TIMEZONE)).toBe("2026-10-01");
    expect(clubMonthStart(new Date("2026-11-01T07:00:00.000Z"), CLUB_TIMEZONE)).toBe("2026-11-01");
  });

  test("formats a month without shifting it to the previous day", () => {
    expect(formatClubMonth("2026-11-01")).toBe("November 2026");
  });

  test("names the current club month on the pick label", () => {
    expect(clubPickLabel("2026-11-01")).toBe("November\u2019s pick");
  });
});

describe("calendar day difference", () => {
  test("reads the club calendar date rather than the UTC date", () => {
    expect(clubCalendarDate(new Date("2026-11-19T03:00:00.000Z"), CLUB_TIMEZONE)).toBe("2026-11-18");
    expect(clubCalendarDate(new Date("2026-11-19T08:00:00.000Z"), CLUB_TIMEZONE)).toBe("2026-11-19");
  });

  test("counts calendar dates, so tomorrow is 1 and today is 0", () => {
    expect(calendarDaysUntil("2026-11-18", "2026-11-18")).toBe(0);
    expect(calendarDaysUntil("2026-11-19", "2026-11-18")).toBe(1);
    expect(calendarDaysUntil("2026-11-28", "2026-11-18")).toBe(10);
  });

  test("is negative when the meeting date is before today", () => {
    expect(calendarDaysUntil("2026-11-17", "2026-11-18")).toBe(-1);
  });

  test("counts the November fallback as one calendar day across a few hours", () => {
    const today = clubCalendarDate(new Date("2026-11-01T06:00:00.000Z"), CLUB_TIMEZONE);
    const meeting = clubCalendarDate(new Date("2026-11-01T09:00:00.000Z"), CLUB_TIMEZONE);
    expect(today).toBe("2026-10-31");
    expect(meeting).toBe("2026-11-01");
    expect(calendarDaysUntil(meeting, today)).toBe(1);
  });
});
