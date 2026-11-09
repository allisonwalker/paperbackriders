import { describe, expect, test } from "vitest";
import { CLUB_TIMEZONE, clubMonthStart, clubTimeZone, formatClubMonth } from "./club-date";

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
});
