import { describe, expect, test } from "vitest";
import { CLUB_TIMEZONE } from "./club-date";
import {
  clubDateAndTime,
  clubDateTimeToUtc,
  meetingFormValues,
  meetingSavedHref,
  parseMeetingInput,
  pickForMeetingMonth,
} from "./meeting-input";

const november = { id: "november", month: "2026-11-01" };
const march = { id: "march", month: "2026-03-01" };
const january = { id: "january", month: "2027-01-01" };

describe("meeting pick default", () => {
  test("uses the pick for the meeting's own month", () => {
    expect(pickForMeetingMonth([march, november, january], "2027-01-01", "2026-12-01")?.id).toBe("january");
  });

  test("uses the featured pick when that month has no row", () => {
    expect(pickForMeetingMonth([march, november, january], "2026-12-01", "2026-12-01")?.id).toBe("november");
  });

  test("a new form starts on that pick, and a saved choice stays selected", () => {
    expect(
      meetingFormValues({
        picks: [march, november, january],
        stored: null,
        today: "2027-01-15",
        currentMonth: "2027-01-01",
      }),
    ).toMatchObject({ date: "2027-01-15", time: "18:30", place: "", pickId: "january" });

    expect(
      meetingFormValues({
        picks: [march, november],
        stored: null,
        today: "2027-01-15",
        currentMonth: "2027-01-01",
      }).pickId,
    ).toBe("november");

    expect(
      meetingFormValues({
        picks: [march, november, january],
        stored: { date: "2027-01-15", time: "19:00", place: "the library", pickId: "march" },
        today: "2026-11-18",
        currentMonth: "2026-11-01",
      }),
    ).toMatchObject({ date: "2027-01-15", time: "19:00", place: "the library", pickId: "march" });
  });
});

describe("meeting clock", () => {
  test("stores 7:00 PM Pacific in November as the next UTC morning", () => {
    const startsAt = clubDateTimeToUtc("2026-11-18", "19:00", CLUB_TIMEZONE);
    expect(startsAt?.toISOString()).toBe("2026-11-19T03:00:00.000Z");
    expect(clubDateAndTime(startsAt as Date, CLUB_TIMEZONE)).toEqual({ date: "2026-11-18", time: "19:00" });
  });

  test("stores 7:00 PM Pacific in July an hour earlier", () => {
    expect(clubDateTimeToUtc("2026-07-18", "19:00", CLUB_TIMEZONE)?.toISOString()).toBe("2026-07-19T02:00:00.000Z");
  });

  test("rejects the hour clocks skip in the spring", () => {
    expect(clubDateTimeToUtc("2026-03-08", "02:30", CLUB_TIMEZONE)).toBeNull();
    expect(parseMeetingInput({ date: "2026-03-08", time: "02:30", place: "library", pickId: "march" }, CLUB_TIMEZONE)).toEqual({
      ok: false,
      errors: { time: "That time does not exist on that date." },
    });
  });

  test("keeps the earlier instant when the clock falls back", () => {
    expect(clubDateTimeToUtc("2026-11-01", "01:30", CLUB_TIMEZONE)?.toISOString()).toBe("2026-11-01T08:30:00.000Z");
  });
});

describe("meeting input", () => {
  test("requires a date, a time, a place, and a pick", () => {
    expect(parseMeetingInput({ date: "", time: "", place: "  ", pickId: "" }, CLUB_TIMEZONE)).toEqual({
      ok: false,
      errors: {
        date: "Choose a date.",
        time: "Choose a time.",
        place: "Write a place.",
        pick: "Choose a pick.",
      },
    });
  });

  test("keeps the place as trimmed plain text", () => {
    const parsed = parseMeetingInput(
      { date: "2026-11-18", time: "19:00:00", place: "  <b>at a member's home</b>  ", pickId: "march" },
      CLUB_TIMEZONE,
    );
    expect(parsed).toMatchObject({
      ok: true,
      draft: { place: "<b>at a member's home</b>", pickId: "march" },
    });
  });

  test("the saved redirect stays on the month she was editing", () => {
    expect(meetingSavedHref("2026-11")).toBe("/edit?tab=meeting&meeting=1&month=2026-11-01");
    expect(meetingSavedHref("2026-11-01T00:00:00.000Z")).toBe("/edit?tab=meeting&meeting=1");
    expect(meetingSavedHref(null)).toBe("/edit?tab=meeting&meeting=1");
  });
});
