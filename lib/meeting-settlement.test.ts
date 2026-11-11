import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CLUB_TIMEZONE } from "./club-date";
import { rememberHappenedMeeting, type HappenedPick, type HappenedStore } from "./meeting-settlement";

type StoredPick = HappenedPick & { month: string };

const now = new Date("2026-11-10T08:30:00.000Z");
const pastClubNight = new Date("2026-11-10T07:30:00.000Z");
const laterThatClubDay = new Date("2026-11-11T06:30:00.000Z");
const nextClubDay = new Date("2026-11-12T03:00:00.000Z");

function settlementMemory(initial: { picks: StoredPick[]; meetings: { pickId: string; startsAt: Date | null }[] }) {
  const picks = initial.picks.map((pick) => ({ ...pick }));
  const meetings = initial.meetings.map((meeting) => ({ ...meeting }));
  const calls = { find: 0, mark: 0 };
  const store: HappenedStore = {
    async listMeetings() {
      return meetings.map((meeting) => ({ ...meeting }));
    },
    async findPick(id) {
      calls.find += 1;
      const pick = picks.find((row) => row.id === id);
      return pick ? { id: pick.id, meetingSettled: pick.meetingSettled } : null;
    },
    async markHappened(pickId) {
      calls.mark += 1;
      const pick = picks.find((row) => row.id === pickId);
      if (!pick) throw new Error(`missing pick ${pickId}`);
      pick.meetingSettled = "happened";
    },
  };
  return { picks, calls, store };
}

describe("remember a meeting that already happened", () => {
  test("marks a past club date happened when that pick is still unsettled", async () => {
    const memory = settlementMemory({
      picks: [
        { id: "oct", month: "2026-10-01", meetingSettled: null },
        { id: "nov", month: "2026-11-01", meetingSettled: null },
      ],
      meetings: [{ pickId: "nov", startsAt: pastClubNight }],
    });

    await rememberHappenedMeeting(now, CLUB_TIMEZONE, memory.store);

    expect(memory.picks.map((pick) => [pick.id, pick.meetingSettled])).toEqual([
      ["oct", null],
      ["nov", "happened"],
    ]);
    expect(memory.calls).toEqual({ find: 1, mark: 1 });
  });

  test("leaves a meeting dated today or later unmarked", async () => {
    for (const startsAt of [laterThatClubDay, nextClubDay]) {
      const memory = settlementMemory({
        picks: [{ id: "nov", month: "2026-11-01", meetingSettled: null }],
        meetings: [{ pickId: "nov", startsAt }],
      });

      await rememberHappenedMeeting(now, CLUB_TIMEZONE, memory.store);

      expect(memory.picks[0]?.meetingSettled).toBeNull();
      expect(memory.calls).toEqual({ find: 0, mark: 0 });
    }
  });

  test("leaves an undated meeting unmarked, and a past club month alone does not count", async () => {
    const undated = settlementMemory({
      picks: [{ id: "march", month: "2026-03-01", meetingSettled: null }],
      meetings: [{ pickId: "march", startsAt: null }],
    });
    const noMeeting = settlementMemory({
      picks: [{ id: "march", month: "2026-03-01", meetingSettled: null }],
      meetings: [],
    });

    await rememberHappenedMeeting(now, CLUB_TIMEZONE, undated.store);
    await rememberHappenedMeeting(now, CLUB_TIMEZONE, noMeeting.store);

    expect(undated.picks[0]?.meetingSettled).toBeNull();
    expect(noMeeting.picks[0]?.meetingSettled).toBeNull();
    expect(undated.calls).toEqual({ find: 0, mark: 0 });
    expect(noMeeting.calls).toEqual({ find: 0, mark: 0 });
  });

  test("does not overwrite a pick already marked skipped or happened", async () => {
    for (const meetingSettled of ["skipped", "happened"] as const) {
      const memory = settlementMemory({
        picks: [{ id: "nov", month: "2026-11-01", meetingSettled }],
        meetings: [{ pickId: "nov", startsAt: pastClubNight }],
      });

      await rememberHappenedMeeting(now, CLUB_TIMEZONE, memory.store);

      expect(memory.picks[0]?.meetingSettled).toBe(meetingSettled);
      expect(memory.calls.mark).toBe(0);
    }
  });

  test("throws when more than one meeting row is stored", async () => {
    const memory = settlementMemory({
      picks: [
        { id: "nov", month: "2026-11-01", meetingSettled: null },
        { id: "dec", month: "2026-12-01", meetingSettled: null },
      ],
      meetings: [
        { pickId: "nov", startsAt: pastClubNight },
        { pickId: "dec", startsAt: pastClubNight },
      ],
    });

    await expect(rememberHappenedMeeting(now, CLUB_TIMEZONE, memory.store)).rejects.toThrow(
      "More than one meeting row is stored",
    );
    expect(memory.picks.every((pick) => pick.meetingSettled === null)).toBe(true);
    expect(memory.calls).toEqual({ find: 0, mark: 0 });
  });

  test("catalog, analytics, and the editor remember a happened meeting before a meeting row can be replaced", () => {
    const picks = readFileSync(new URL("./picks.ts", import.meta.url), "utf8");
    const reading = readFileSync(new URL("./reading.ts", import.meta.url), "utf8");
    const visits = readFileSync(new URL("./visits.ts", import.meta.url), "utf8");
    const meeting = readFileSync(new URL("./meeting.ts", import.meta.url), "utf8");
    const records = readFileSync(new URL("./meeting-records.ts", import.meta.url), "utf8");

    expect(functionBody(picks, "export async function loadFeaturedPick")).toContain("loadCatalogPicks");
    expectRememberBefore(picks, "async function loadCatalogPicks", "loadAllPicks");
    expect(functionBody(reading, "export async function loadReadingTotals")).toContain("loadReadingRows");
    expectRememberBefore(reading, "async function loadReadingRows", "getDb()");
    expect(functionBody(visits, "export async function loadMeetingPins")).toContain("loadConfirmedVisitRows");
    expectRememberBefore(visits, "export async function loadConfirmedVisitRows", "getDb()");
    expectRememberBefore(meeting, "export async function loadEditorMeeting", "loadMeetingRow");

    const save = functionBody(records, "async save(draft)");
    expect(save.indexOf("rememberHappenedMeeting")).toBeGreaterThanOrEqual(0);
    expect(save.indexOf("rememberHappenedMeeting")).toBeLessThan(save.indexOf("onConflictDoUpdate"));

    const skip = functionBody(records, "export async function skipCurrentMeeting");
    expect(skip.indexOf("rememberHappened")).toBeGreaterThanOrEqual(0);
    expect(skip.indexOf("rememberHappened")).toBeLessThan(skip.indexOf("deleteMeeting"));
    expect(skip.indexOf("rememberHappened")).toBeLessThan(skip.indexOf("moveMeeting"));
  });
});

function expectRememberBefore(source: string, signature: string, later: string) {
  const body = functionBody(source, signature);
  const rememberAt = body.indexOf("rememberHappenedMeeting");
  const laterAt = body.indexOf(later);
  expect(rememberAt).toBeGreaterThanOrEqual(0);
  expect(laterAt).toBeGreaterThan(rememberAt);
  expect(body.slice(0, rememberAt)).not.toMatch(/\.insert\(meetings\)|\.update\(meetings\)|\.delete\(meetings\)|onConflictDoUpdate/);
}

function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start + signature.length);
  const next = rest.search(/\n(?:export )?(?:async )?function /);
  return next === -1 ? source.slice(start) : source.slice(start, start + signature.length + next);
}
