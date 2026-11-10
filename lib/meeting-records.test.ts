import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { CLUB_TIMEZONE } from "./club-date";
import { presentMeeting } from "./meeting";
import {
  saveMeeting,
  type MeetingPickRef,
  type MeetingStore,
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
