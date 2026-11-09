import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { meetingPins } from "./visits";
import { RecordKeeperRequiredError } from "./record-keeper";
import { loadVenueName, saveVenueName, VENUE_NAME_LIMIT, type StoredVisit, type VenueStore } from "./visit-records";

const march = "2026-03-01";
const pickId = "33333333-3333-4333-8333-333333333333";

function memoryStore(knownMonth: string | null = march, existing?: StoredVisit) {
  const state: { find: number; save: number; row: StoredVisit | null; pickId: string | null } = {
    find: 0,
    save: 0,
    row: existing ?? null,
    pickId: knownMonth ? pickId : null,
  };
  const store: VenueStore = {
    async findPickByMonth(month) {
      state.find += 1;
      if (month !== knownMonth || !state.pickId) return null;
      return { id: state.pickId };
    },
    async saveName(id, enteredName) {
      state.save += 1;
      state.row = {
        id: state.row?.id ?? "visit-1",
        pickId: id,
        enteredName,
        placeId: state.row?.placeId ?? null,
      };
      return state.row;
    },
  };
  return { state, store };
}

function explodingStore(): VenueStore {
  const fail = async () => {
    throw new Error("the store should not be touched");
  };
  return { findPickByMonth: fail, saveName: fail };
}

const keeper = async () => ({ email: "keeper@example.com" });
const stranger = async () => ({ email: "member@example.com" });
const nobody = async () => null;

function options(store: VenueStore, readSession: typeof keeper | typeof stranger | typeof nobody = keeper) {
  return { store, readSession, allowlisted: "keeper@example.com" };
}

describe("save a venue name", () => {
  test("a caller who is not the record keeper cannot save", async () => {
    await expect(
      saveVenueName({ month: march, enteredName: "The Ruby" }, options(explodingStore(), nobody)),
    ).rejects.toBeInstanceOf(RecordKeeperRequiredError);
    await expect(
      saveVenueName({ month: march, enteredName: "The Ruby" }, options(explodingStore(), stranger)),
    ).rejects.toBeInstanceOf(RecordKeeperRequiredError);
  });

  test("saveVenueName checks the session, writes the name only, and does not geocode or insert a place", () => {
    const source = readFileSync(new URL("./visit-records.ts", import.meta.url), "utf8");
    const action = readFileSync(new URL("../app/edit/venue-actions.ts", import.meta.url), "utf8");
    const form = readFileSync(new URL("../app/edit/venue-form.tsx", import.meta.url), "utf8");
    const meeting = readFileSync(new URL("./meeting-records.ts", import.meta.url), "utf8");
    const pins = readFileSync(new URL("./visits.ts", import.meta.url), "utf8");

    expect(source).toContain("requireRecordKeeper(");
    expect(source).toContain("values({ pickId, enteredName })");
    expect(source).toContain("set: { enteredName }");
    expect(source).toContain("onConflictDoUpdate");
    expect(source).not.toContain(".insert(places)");
    expect(source).not.toMatch(/geoapify|GEOAPIFY|nominatim|fetch\s*\(/i);
    expect(source).not.toMatch(/latitude|longitude|providerId/);
    expect(action).toContain("saveVenueName");
    expect(action).toContain("RecordKeeperRequiredError");
    expect(action).not.toContain("getDb(");
    expect(form).not.toContain("requireRecordKeeper");
    expect(form).not.toContain("getDb");
    expect(form).not.toContain("visit-records");
    expect(meeting).not.toMatch(/\bvisits\b|enteredName|entered_name/);
    expect(pins).not.toMatch(/enteredName|entered_name/);
  });

  test("stores one name for a past month and leaves the place empty", async () => {
    const memory = memoryStore();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));

    try {
      const result = await saveVenueName({ month: "2026-03", enteredName: "  The Ruby  " }, options(memory.store));

      expect(result).toEqual({ status: "saved", id: "visit-1", month: march, enteredName: "The Ruby" });
      expect(memory.state).toMatchObject({ find: 1, save: 1, row: { placeId: null, enteredName: "The Ruby" } });
      expect(
        meetingPins(
          [
            {
              placeId: null,
              label: null,
              latitude: null,
              longitude: null,
              month: march,
              kind: "book",
              title: "Kindred",
              author: "Octavia Butler",
              promptText: null,
              coverUrl: null,
            },
          ],
          "2026-11-01",
        ),
      ).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("saving again updates that visit and keeps a place id the store already had", async () => {
    const memory = memoryStore(march, {
      id: "visit-1",
      pickId,
      enteredName: "Ruby",
      placeId: "place-1",
    });

    const result = await saveVenueName({ month: march, enteredName: "The Ruby" }, options(memory.store));

    expect(result).toMatchObject({ status: "saved", id: "visit-1", enteredName: "The Ruby" });
    expect(memory.state.row).toEqual({
      id: "visit-1",
      pickId,
      enteredName: "The Ruby",
      placeId: "place-1",
    });
    expect(memory.state.save).toBe(1);
  });

  test("a blank name or a missing month does not write", async () => {
    const memory = memoryStore();

    await expect(saveVenueName({ month: march, enteredName: "   " }, options(memory.store))).resolves.toMatchObject({
      status: "invalid",
      errors: { enteredName: "Enter a venue name." },
    });
    await expect(saveVenueName({ month: "not-a-month", enteredName: "The Ruby" }, options(memory.store))).resolves.toMatchObject({
      status: "invalid",
    });
    await expect(
      saveVenueName({ month: march, enteredName: "a".repeat(VENUE_NAME_LIMIT + 1) }, options(memory.store)),
    ).resolves.toMatchObject({ status: "invalid" });
    await expect(saveVenueName({ month: "2026-04-01", enteredName: "The Ruby" }, options(memory.store))).resolves.toEqual({
      status: "missing",
      message: "That month is not saved.",
    });

    expect(memory.state.save).toBe(0);
  });

  test("a database failure is an error and the log omits the name and the database url", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store: VenueStore = {
      async findPickByMonth() {
        return { id: pickId };
      },
      async saveName() {
        throw new Error("postgres://user:secret@localhost/db The Ruby");
      },
    };

    try {
      await expect(saveVenueName({ month: march, enteredName: "The Ruby" }, options(store))).resolves.toEqual({
        status: "error",
      });
      expect(error).toHaveBeenCalledWith("saving a venue name failed", { pickId, code: undefined });
      expect(JSON.stringify(error.mock.calls)).not.toContain("The Ruby");
      expect(JSON.stringify(error.mock.calls)).not.toContain("postgres://");
    } finally {
      error.mockRestore();
    }
  });
});

describe("load a venue name", () => {
  test("returns the stored name, or nothing when the month has no visit", async () => {
    await expect(loadVenueName(march, { read: async () => "Cal Anderson Park" })).resolves.toEqual({
      status: "ready",
      enteredName: "Cal Anderson Park",
    });
    await expect(loadVenueName(march, { read: async () => null })).resolves.toEqual({
      status: "ready",
      enteredName: null,
    });
    await expect(loadVenueName("2026-03-15", { read: async () => "should not be read" })).resolves.toEqual({
      status: "ready",
      enteredName: null,
    });
  });

  test("a failed read is an error, not an empty name", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(
        loadVenueName(march, {
          read: async () => {
            throw new Error("postgres://user:secret@localhost/db");
          },
        }),
      ).resolves.toEqual({ status: "error" });
      expect(error).toHaveBeenCalledWith("venue name query failed", { month: march });
      expect(JSON.stringify(error.mock.calls)).not.toContain("postgres://");
    } finally {
      error.mockRestore();
    }
  });
});
