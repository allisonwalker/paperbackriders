import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CLUB_TIMEZONE } from "./club-date";
import { loadNextMeeting, presentMeeting, type MeetingSource } from "./meeting";
import type { PickRecord } from "./picks";

const noonPacific = new Date("2026-11-18T20:00:00.000Z");

function book(overrides: Partial<PickRecord> = {}): PickRecord {
  return {
    id: "pick-book",
    month: "2026-11-01",
    kind: "book",
    promptText: null,
    title: "The Prestige",
    author: "Christopher Priest",
    publishedYear: 1995,
    coverUrl: null,
    pageCount: 404,
    genre: "Fiction",
    ...overrides,
  };
}

function meeting(startsAt: string, pick: PickRecord = book(), place = "Priya's house"): MeetingSource {
  return { id: "meeting-1", startsAt: new Date(startsAt), place, pick };
}

describe("next meeting", () => {
  test("counts today as 0 when the meeting is later the same evening", () => {
    const view = presentMeeting(meeting("2026-11-19T03:00:00.000Z"), noonPacific, CLUB_TIMEZONE);

    expect(view).toMatchObject({
      status: "upcoming",
      daysRemaining: 0,
      lead: "Meets today",
      dateLabel: "Wednesday, November 18, 2026",
      timeLabel: "7:00 PM",
      place: "Priya's house",
      discussing: "The Prestige by Christopher Priest",
    });
    expect(JSON.stringify(view)).not.toContain("2026-11-19T03:00:00.000Z");
  });

  test("counts tomorrow as 1", () => {
    const view = presentMeeting(meeting("2026-11-20T03:00:00.000Z"), noonPacific, CLUB_TIMEZONE);

    expect(view).toMatchObject({
      status: "upcoming",
      daysRemaining: 1,
      lead: "Meets in 1 day",
      dateLabel: "Thursday, November 19, 2026",
      timeLabel: "7:00 PM",
    });
  });

  test("names a prompt by its text", () => {
    const view = presentMeeting(
      meeting(
        "2026-11-20T03:00:00.000Z",
        book({
          id: "pick-prompt",
          kind: "prompt",
          promptText: " Book Exchange ",
          title: null,
          author: null,
          publishedYear: null,
          pageCount: null,
          genre: null,
        }),
      ),
      noonPacific,
      CLUB_TIMEZONE,
    );

    expect(view).toMatchObject({ status: "upcoming", discussing: "Book Exchange" });
  });

  test("treats a club date before today as not upcoming, even within 24 hours", () => {
    const morningAfter = new Date("2026-11-18T16:00:00.000Z");
    const view = presentMeeting(meeting("2026-11-18T03:00:00.000Z"), morningAfter, CLUB_TIMEZONE);

    expect(view).toEqual({ status: "none" });
  });

  test("is empty when no meeting is stored", () => {
    expect(presentMeeting(null, noonPacific, CLUB_TIMEZONE)).toEqual({ status: "none" });
  });

  test("uses the club calendar when the row is loaded", async () => {
    const result = await loadNextMeeting({
      now: noonPacific,
      timeZone: CLUB_TIMEZONE,
      loadRow: async () => meeting("2026-11-29T03:00:00.000Z"),
    });

    expect(result).toMatchObject({ status: "upcoming", daysRemaining: 10, lead: "Meets in 10 days" });
  });

  test("hides a past row without treating the query as a failure", async () => {
    const result = await loadNextMeeting({
      now: noonPacific,
      timeZone: CLUB_TIMEZONE,
      loadRow: async () => meeting("2026-11-18T03:00:00.000Z"),
    });

    expect(result).toEqual({ status: "none" });
  });

  test("says the page could not load when the query fails", async () => {
    const result = await loadNextMeeting({
      now: noonPacific,
      timeZone: CLUB_TIMEZONE,
      loadRow: async () => {
        throw new Error("connection refused");
      },
    });

    expect(result).toEqual({ status: "error" });
  });

  test("does not call Open Library or delete a meeting on a schedule", () => {
    const meetingSource = readFileSync(new URL("./meeting.ts", import.meta.url), "utf8");
    const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
    const publicPage = readFileSync(new URL("../app/public-page.tsx", import.meta.url), "utf8");
    const vercel = readFileSync(new URL("../vercel.ts", import.meta.url), "utf8");

    for (const source of [meetingSource, pageSource, publicPage]) {
      expect(source).not.toMatch(/openlibrary\.org\/search/i);
      expect(source).not.toMatch(/\.delete\(|setInterval|cron/);
    }
    expect(vercel).not.toMatch(/crons/);
    expect(publicPage).not.toMatch(/maps\.|geocode|mailto:/);
  });
});
