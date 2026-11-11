import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { CLUB_TIMEZONE, clubCalendarDate } from "./club-date";
import { presentMeeting } from "./meeting";
import {
  saveMeeting,
  skipCurrentMeeting,
  type MeetingPickRef,
  type MeetingStore,
  type SkipPick,
  type SkipStore,
  type StoredMeeting,
} from "./meeting-records";
import { RecordKeeperRequiredError } from "./record-keeper";
import type { PickRecord } from "./picks";

const promptPick: MeetingPickRef = { id: "prompt-1", kind: "prompt" };
const bookPick: MeetingPickRef = { id: "book-1", kind: "book" };

function promptRecord(): PickRecord {
  return {
    id: "prompt-1",
    month: "2026-03-01",
    kind: "prompt",
    promptText: "Read a book from the year you were born.",
    title: null,
    author: null,
    publishedYear: null,
    coverUrl: null,
    pageCount: null,
    genre: null,
    lookupSource: null,
    lookupKey: null,
    alsoRead: null,
  };
}

function memoryStore(known: MeetingPickRef[] = [bookPick, promptPick]) {
  const state: { row: StoredMeeting | null; find: number; save: number } = { row: null, find: 0, save: 0 };
  const store: MeetingStore = {
    async findPick(id) {
      state.find += 1;
      return known.find((pick) => pick.id === id) ?? null;
    },
    async save(draft) {
      state.save += 1;
      state.row = {
        id: state.row?.id ?? "meeting-1",
        pickId: draft.pickId,
        startsAt: draft.startsAt,
        place: draft.place,
        updatedAt: new Date(),
      };
      return state.row;
    },
  };
  return { state, store };
}

function explodingStore(): MeetingStore {
  const fail = async () => {
    throw new Error("the store should not be touched");
  };
  return { findPick: fail, save: fail };
}

const keeper = async () => ({ email: "keeper@example.com" });
const stranger = async () => ({ email: "member@example.com" });
const nobody = async () => null;

function options(store: MeetingStore, readSession: typeof keeper | typeof stranger | typeof nobody = keeper) {
  return { store, readSession, allowlisted: "keeper@example.com", timeZone: CLUB_TIMEZONE };
}

const meetingInput = {
  date: "2026-11-18",
  time: "19:00",
  place: "at a member's home",
  pickId: "prompt-1",
};

describe("save the next meeting", () => {
  test("a caller who is not the record keeper cannot save", async () => {
    const memory = memoryStore();

    await expect(saveMeeting(meetingInput, options(explodingStore(), nobody))).rejects.toBeInstanceOf(
      RecordKeeperRequiredError,
    );
    await expect(saveMeeting(meetingInput, options(explodingStore(), stranger))).rejects.toBeInstanceOf(
      RecordKeeperRequiredError,
    );

    expect(memory.state).toMatchObject({ find: 0, save: 0, row: null });
  });

  test("saveMeeting calls requireRecordKeeper and replaces the one row", () => {
    const source = readFileSync(new URL("./meeting-records.ts", import.meta.url), "utf8");
    const action = readFileSync(new URL("../app/edit/meeting-actions.ts", import.meta.url), "utf8");
    const form = readFileSync(new URL("../app/edit/meeting-form.tsx", import.meta.url), "utf8");

    expect(source).toContain("requireRecordKeeper(");
    expect(source).toContain("onConflictDoUpdate");
    expect(source).not.toMatch(/geocode|maps\.|fetch\s*\(/);
    expect(source).toContain(".delete(meetings)");
    expect(action).toContain("saveMeeting");
    expect(action).toContain("RecordKeeperRequiredError");
    expect(action).not.toContain("getDb(");
    expect(form).not.toMatch(/geocode|maps\.|type="tel"|type="email"|name="phone"|name="email"/);
  });

  test("stores a prompt month in UTC and shows it in Pacific time", async () => {
    const memory = memoryStore();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));

    try {
      const result = await saveMeeting(meetingInput, options(memory.store));
      expect(result).toMatchObject({
        status: "saved",
        id: "meeting-1",
        pickId: "prompt-1",
        place: "at a member's home",
      });
      if (result.status !== "saved" || !result.startsAt) return;
      expect(result.startsAt.toISOString()).toBe("2026-11-19T03:00:00.000Z");

      const view = presentMeeting(
        { id: result.id, startsAt: result.startsAt, place: result.place, pick: promptRecord() },
        new Date("2026-11-18T20:00:00.000Z"),
        CLUB_TIMEZONE,
      );
      expect(view).toMatchObject({
        status: "upcoming",
        dateLabel: "Wednesday, November 18, 2026",
        timeLabel: "7:00 PM",
        place: "at a member's home",
        discussing: "Read a book from the year you were born.",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("saving again replaces the same row", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T00:00:00.000Z"));
    const memory = memoryStore();

    try {
      await saveMeeting(meetingInput, options(memory.store));
      vi.setSystemTime(new Date("2026-11-02T00:00:00.000Z"));
      const replaced = await saveMeeting(
        { ...meetingInput, time: "18:00", place: "the library", pickId: "book-1" },
        options(memory.store),
      );

      expect(replaced).toMatchObject({ status: "saved", id: "meeting-1", pickId: "book-1", place: "the library" });
      expect(memory.state.save).toBe(2);
      expect(memory.state.row).toMatchObject({
        id: "meeting-1",
        pickId: "book-1",
        place: "the library",
        startsAt: new Date("2026-11-19T02:00:00.000Z"),
        updatedAt: new Date("2026-11-02T00:00:00.000Z"),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("does not write when the pick, date, time, or place is missing", async () => {
    const memory = memoryStore();
    const missing = await saveMeeting({ date: "", time: "", place: " ", pickId: "" }, options(memory.store));
    const unknown = await saveMeeting({ ...meetingInput, pickId: "missing" }, options(memory.store));

    expect(missing).toMatchObject({ status: "invalid" });
    expect(unknown).toEqual({ status: "invalid", errors: { pick: "Choose a stored pick." } });
    expect(memory.state.save).toBe(0);
    expect(memory.state.row).toBeNull();
  });
});

type SkipMeeting = {
  id: string;
  pickId: string;
  startsAt: Date | null;
  place: string | null;
  updatedAt: Date;
};

const skipNow = new Date("2026-11-10T20:00:00.000Z");
const scheduledStart = new Date("2026-11-19T03:00:00.000Z");

function skipPick(id: string, month: string, meetingSettled: SkipPick["meetingSettled"] = null): SkipPick {
  return { id, month, meetingSettled };
}

function scheduledMeeting(pickId: string): SkipMeeting {
  return {
    id: "meeting-1",
    pickId,
    startsAt: scheduledStart,
    place: "at a member's home",
    updatedAt: new Date("2026-11-01T00:00:00.000Z"),
  };
}

function skipMemory(initial: { picks: SkipPick[]; meeting: SkipMeeting | null }) {
  const picks = initial.picks.map((pick) => ({ ...pick }));
  let meeting = initial.meeting ? { ...initial.meeting } : null;
  const writes = { mark: 0, delete: 0, move: 0 };
  const store: SkipStore = {
    async rememberHappened() {},
    async listPicks() {
      return picks.map((pick) => ({ ...pick }));
    },
    async loadMeeting(_now, timeZone) {
      if (!meeting) return null;
      return {
        pickId: meeting.pickId,
        meetingDay: meeting.startsAt ? clubCalendarDate(meeting.startsAt, timeZone) : null,
      };
    },
    async markSkipped(pickId) {
      writes.mark += 1;
      const pick = picks.find((row) => row.id === pickId);
      if (!pick) throw new Error(`missing pick ${pickId}`);
      pick.meetingSettled = "skipped";
    },
    async deleteMeeting() {
      writes.delete += 1;
      meeting = null;
    },
    async moveMeeting(pickId, updatedAt) {
      writes.move += 1;
      if (!meeting) {
        meeting = { id: "meeting-new", pickId, startsAt: null, place: null, updatedAt };
        return;
      }
      meeting = { ...meeting, pickId, startsAt: null, place: null, updatedAt };
    },
  };
  return {
    writes,
    store,
    picks: () => picks,
    meeting: () => meeting,
  };
}

function explodingSkipStore(): SkipStore {
  const fail = async () => {
    throw new Error("the store should not be touched");
  };
  return {
    rememberHappened: fail,
    listPicks: fail,
    loadMeeting: fail,
    markSkipped: fail,
    deleteMeeting: fail,
    moveMeeting: fail,
  };
}

function skipOptions(store: SkipStore, readSession: typeof keeper | typeof stranger | typeof nobody = keeper) {
  return { store, readSession, allowlisted: "keeper@example.com", timeZone: CLUB_TIMEZONE, now: skipNow };
}

describe("skip the current meeting", () => {
  test("a caller who is not the record keeper cannot skip", async () => {
    await expect(skipCurrentMeeting(skipOptions(explodingSkipStore(), nobody))).rejects.toBeInstanceOf(
      RecordKeeperRequiredError,
    );
    await expect(skipCurrentMeeting(skipOptions(explodingSkipStore(), stranger))).rejects.toBeInstanceOf(
      RecordKeeperRequiredError,
    );

    const source = readFileSync(new URL("./meeting-records.ts", import.meta.url), "utf8");
    const start = source.indexOf("export async function skipCurrentMeeting");
    const body = source.slice(start, source.indexOf("function defaultSkipStore"));
    expect(body.indexOf("requireRecordKeeper(")).toBeGreaterThanOrEqual(0);
    expect(body.indexOf("requireRecordKeeper(")).toBeLessThan(body.indexOf("rememberHappened"));
    expect(body).not.toContain("getDb(");
  });

  test("marks the current pick skipped and moves the meeting onto the next pick", async () => {
    const memory = skipMemory({
      picks: [skipPick("nov", "2026-11-01"), skipPick("dec", "2026-12-01"), skipPick("jan", "2027-01-01")],
      meeting: scheduledMeeting("nov"),
    });

    await expect(skipCurrentMeeting(skipOptions(memory.store))).resolves.toEqual({ status: "skipped" });

    expect(memory.picks().map((pick) => pick.meetingSettled)).toEqual(["skipped", null, null]);
    expect(memory.meeting()).toMatchObject({
      id: "meeting-1",
      pickId: "dec",
      startsAt: null,
      place: null,
    });
    expect(memory.writes).toEqual({ mark: 1, delete: 0, move: 1 });
  });

  test("deletes the meeting when no later pick is saved", async () => {
    const memory = skipMemory({
      picks: [skipPick("nov", "2026-11-01")],
      meeting: scheduledMeeting("nov"),
    });

    await expect(skipCurrentMeeting(skipOptions(memory.store))).resolves.toEqual({ status: "skipped" });

    expect(memory.picks()[0]?.meetingSettled).toBe("skipped");
    expect(memory.meeting()).toBeNull();
    expect(memory.writes).toEqual({ mark: 1, delete: 1, move: 0 });
  });

  test("refuses a pick already marked happened and writes nothing", async () => {
    const memory = skipMemory({
      picks: [skipPick("nov", "2026-11-01", "happened"), skipPick("dec", "2026-12-01")],
      meeting: scheduledMeeting("nov"),
    });

    await expect(skipCurrentMeeting(skipOptions(memory.store))).resolves.toEqual({ status: "invalid" });

    expect(memory.picks().map((pick) => pick.meetingSettled)).toEqual(["happened", null]);
    expect(memory.meeting()).toEqual(scheduledMeeting("nov"));
    expect(memory.writes).toEqual({ mark: 0, delete: 0, move: 0 });
  });

  test("the public page does not announce the skip", () => {
    const page = readFileSync(new URL("../app/public-page.tsx", import.meta.url), "utf8");
    const copy = readFileSync(new URL("./meeting-copy.ts", import.meta.url), "utf8");
    const meeting = readFileSync(new URL("./meeting.ts", import.meta.url), "utf8");
    const form = readFileSync(new URL("../app/edit/meeting-form.tsx", import.meta.url), "utf8");

    expect(page).not.toMatch(/skip/i);
    expect(copy).not.toMatch(/skip/i);
    expect(meeting).not.toMatch(/skip/i);
    expect(form).toContain("won&apos;t announce the skip");
  });
});
