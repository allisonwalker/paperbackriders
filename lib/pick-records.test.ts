import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
  deletePick,
  insertPick,
  MEETING_BLOCKS_DELETE,
  savePick,
  updatePick,
  type PickStore,
  type StoredPick,
} from "./pick-records";
import { RecordKeeperRequiredError } from "./record-keeper";
import type { PickDraft } from "./validation";

const root = path.resolve(import.meta.dirname, "..");

function book(overrides: Record<string, unknown> = {}) {
  return {
    month: "2026-11",
    kind: "book",
    title: "The Left Hand of Darkness",
    author: "Ursula K. Le Guin",
    publishedYear: "",
    coverUrl: "",
    pageCount: "",
    genre: "",
    promptText: "This must not be stored on a book",
    lookupSource: "open_library",
    lookupKey: "OL123W",
    ...overrides,
  };
}

function prompt(overrides: Record<string, unknown> = {}) {
  return {
    month: "2026-03",
    kind: "prompt",
    promptText: " Read a book from the year you were born. ",
    title: "Should not be stored",
    author: "Should not be stored",
    publishedYear: "1990",
    coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
    pageCount: "100",
    genre: "Memoir",
    ...overrides,
  };
}

function codedError(code: string, message = "database rejected the row"): Error {
  const error = new Error(message) as Error & { code?: string; cause?: unknown };
  error.code = code;
  return error;
}

function memoryStore(options?: {
  rows?: StoredPick[];
  blockedId?: string | null;
  insertError?: () => Error;
  deleteError?: () => Error;
}) {
  const rows = [...(options?.rows ?? [])];
  const calls = { insert: 0, update: 0, delete: 0, find: 0 };
  let nextId = rows.length + 1;
  const store: PickStore = {
    async findByMonth(month) {
      calls.find += 1;
      return rows.find((row) => row.month === month) ?? null;
    },
    async insert(draft) {
      calls.insert += 1;
      if (options?.insertError) throw options.insertError();
      if (rows.some((row) => row.month === draft.month)) throw codedError("23505");
      const stored = toStored(`pick-${nextId}`, draft);
      nextId += 1;
      rows.push(stored);
      return stored;
    },
    async update(id, draft) {
      calls.update += 1;
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) return null;
      const stored = toStored(id, draft);
      rows[index] = stored;
      return stored;
    },
    async deleteIfUnreferenced(id) {
      calls.delete += 1;
      if (options?.deleteError) throw options.deleteError();
      if (options?.blockedId === id) return "blocked";
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) return "missing";
      rows.splice(index, 1);
      return "deleted";
    },
  };
  return { rows, calls, store };
}

function toStored(id: string, draft: PickDraft): StoredPick {
  return { ...draft, id };
}

function explodingStore(): PickStore {
  const fail = async () => {
    throw new Error("the store should not be touched");
  };
  return { findByMonth: fail, insert: fail, update: fail, deleteIfUnreferenced: fail };
}

const keeper = async () => ({ email: "keeper@example.com" });
const stranger = async () => ({ email: "member@example.com" });
const nobody = async () => null;

function options(store: PickStore, readSession: typeof keeper | typeof stranger | typeof nobody = keeper) {
  return { store, readSession, allowlisted: "keeper@example.com" };
}

describe("record keeper writes", () => {
  test("a caller who is not the record keeper cannot insert, update, or delete", async () => {
    const memory = memoryStore();
    const denied = [options(explodingStore(), nobody), options(explodingStore(), stranger)];

    for (const opts of denied) {
      await expect(insertPick(book(), opts)).rejects.toBeInstanceOf(RecordKeeperRequiredError);
      await expect(updatePick(book(), opts)).rejects.toBeInstanceOf(RecordKeeperRequiredError);
      await expect(deletePick({ month: "2026-11" }, opts)).rejects.toBeInstanceOf(RecordKeeperRequiredError);
      await expect(savePick(book(), opts)).rejects.toBeInstanceOf(RecordKeeperRequiredError);
    }

    expect(memory.calls).toEqual({ insert: 0, update: 0, delete: 0, find: 0 });
  });

  test("each write function calls requireRecordKeeper", () => {
    const source = readFileSync(path.join(root, "lib/pick-records.ts"), "utf8");
    for (const name of ["insertPick", "updatePick", "deletePick", "savePick"]) {
      expect(functionBody(source, name)).toContain("requireRecordKeeper(");
    }
  });

  test("saves a book by hand with manual lookup and empty optional fields", async () => {
    const memory = memoryStore();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));

    try {
      const result = await savePick(book(), options(memory.store));
      expect(result).toMatchObject({ status: "saved", month: "2026-11-01", coverDropped: false });
      expect(memory.calls.insert).toBe(1);
      expect(memory.rows).toHaveLength(1);
      expect(memory.rows[0]).toMatchObject({
        month: "2026-11-01",
        kind: "book",
        title: "The Left Hand of Darkness",
        author: "Ursula K. Le Guin",
        publishedYear: null,
        coverUrl: null,
        pageCount: null,
        genre: null,
        promptText: null,
        lookupSource: "manual",
        lookupKey: null,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("drops a foreign cover and still saves the book", async () => {
    const memory = memoryStore();
    const result = await savePick(book({ coverUrl: "https://example.com/cover.jpg", title: "Kept" }), options(memory.store));

    expect(result).toMatchObject({ status: "saved", coverDropped: true });
    expect(memory.rows[0]).toMatchObject({ title: "Kept", coverUrl: null, lookupSource: "manual" });
  });

  test("saves a prompt with no book fields", async () => {
    const memory = memoryStore();
    const result = await savePick(prompt(), options(memory.store));

    expect(result).toMatchObject({ status: "saved", month: "2026-03-01", coverDropped: false });
    expect(memory.rows[0]).toEqual({
      id: memory.rows[0]?.id,
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
    });
  });

  test("a second save of the same month updates that row", async () => {
    const memory = memoryStore();
    const opts = options(memory.store);
    const first = await savePick(book({ month: "2026-11" }), opts);
    const second = await savePick(book({ month: "2026-11-15", title: "Corrected" }), opts);

    expect(first).toMatchObject({ status: "saved" });
    expect(second).toMatchObject({ status: "saved", month: "2026-11-01" });
    expect(memory.calls.insert).toBe(1);
    expect(memory.calls.update).toBe(1);
    expect(memory.rows).toHaveLength(1);
    expect(memory.rows[0]).toMatchObject({ title: "Corrected", month: "2026-11-01" });
    if (first.status === "saved") expect(memory.rows[0]?.id).toBe(first.id);
  });

  test("changing book to prompt clears the book fields, and prompt to book clears the prompt", async () => {
    const memory = memoryStore();
    const opts = options(memory.store);
    const created = await savePick(book({ month: "2026-04", publishedYear: "1969", genre: "Fiction" }), opts);
    await savePick(prompt({ month: "2026-04" }), opts);

    expect(memory.rows).toHaveLength(1);
    expect(memory.rows[0]).toMatchObject({
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
    });
    if (created.status === "saved") expect(memory.rows[0]?.id).toBe(created.id);

    await savePick(book({ month: "2026-04", title: "Now a book" }), opts);
    expect(memory.rows[0]).toMatchObject({
      kind: "book",
      title: "Now a book",
      promptText: null,
      lookupSource: "manual",
      lookupKey: null,
    });
    expect(memory.rows).toHaveLength(1);
  });

  test("does not write when the form is invalid", async () => {
    const result = await savePick(book({ author: "  " }), options(explodingStore()));
    expect(result).toMatchObject({ status: "invalid", errors: { author: "Enter an author." } });
  });

  test("an insert that loses a unique race updates the existing month", async () => {
    const seeded: StoredPick = {
      id: "pick-1",
      month: "2026-11-01",
      kind: "book",
      title: "Old",
      author: "Old Author",
      promptText: null,
      publishedYear: null,
      coverUrl: null,
      pageCount: null,
      genre: null,
      lookupSource: "manual",
      lookupKey: null,
    };
    const memory = memoryStore({ rows: [seeded], insertError: () => codedError("23505") });
    const result = await insertPick(book({ title: "New" }), options(memory.store));

    expect(result).toMatchObject({ status: "saved", id: "pick-1" });
    expect(memory.calls).toMatchObject({ insert: 1, update: 1 });
    expect(memory.rows).toHaveLength(1);
    expect(memory.rows[0]?.title).toBe("New");
  });

  test("a check failure is not saved and the log omits the database url", async () => {
    const databaseUrl = "postgres://user:password@db.example/paperback";
    const memory = memoryStore({ insertError: () => codedError("23514", `failed ${databaseUrl}`) });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const result = await savePick(book(), options(memory.store));
      expect(result).toEqual({ status: "error" });
      expect(memory.rows).toHaveLength(0);
      expect(spy.mock.calls.flat().join(" ")).not.toContain(databaseUrl);
    } finally {
      spy.mockRestore();
    }
  });

  test("refuses to delete a pick the meeting points at, and the pick remains", async () => {
    const seeded: StoredPick = {
      id: "pick-9",
      month: "2026-11-01",
      kind: "book",
      title: "Held",
      author: "Author",
      promptText: null,
      publishedYear: null,
      coverUrl: null,
      pageCount: null,
      genre: null,
      lookupSource: "manual",
      lookupKey: null,
    };
    const memory = memoryStore({ rows: [seeded], blockedId: "pick-9" });
    const result = await deletePick({ month: "2026-11" }, options(memory.store));

    expect(result).toEqual({ status: "blocked", message: MEETING_BLOCKS_DELETE });
    expect(memory.rows).toEqual([seeded]);
    expect(memory.calls.insert).toBe(0);
    expect(memory.calls.update).toBe(0);
  });

  test("a foreign-key refusal also leaves the pick in place", async () => {
    const seeded: StoredPick = {
      id: "pick-9",
      month: "2026-11-01",
      kind: "book",
      title: "Held",
      author: "Author",
      promptText: null,
      publishedYear: null,
      coverUrl: null,
      pageCount: null,
      genre: null,
      lookupSource: "manual",
      lookupKey: null,
    };
    const wrapped = new Error("wrapped");
    wrapped.cause = codedError("23503");
    const memory = memoryStore({ rows: [seeded], deleteError: () => wrapped });
    const result = await deletePick({ month: "2026-11-01" }, options(memory.store));

    expect(result).toEqual({ status: "blocked", message: MEETING_BLOCKS_DELETE });
    expect(memory.rows).toEqual([seeded]);
  });

  test("deletes a month the meeting does not point at", async () => {
    const memory = memoryStore();
    const opts = options(memory.store);
    await savePick(book(), opts);
    const result = await deletePick({ month: "2026-11-01" }, opts);

    expect(result).toEqual({ status: "deleted", month: "2026-11-01" });
    expect(memory.rows).toHaveLength(0);
  });
});

describe("this story does not call a catalog", () => {
  test("the write path does not call Goodreads or Open Library", () => {
    const files = [
      "lib/validation.ts",
      "lib/pick-records.ts",
      "app/edit/pick-actions.ts",
      "app/edit/pick-form.tsx",
      "app/edit/edit-screen.tsx",
      "app/edit/page.tsx",
      "app/edit/editor-query.ts",
    ];

    for (const file of files) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source.toLowerCase()).not.toContain("goodreads");
      expect(source).not.toMatch(/openlibrary\.org\/search/);
      expect(source).not.toMatch(/\bfetch\s*\(/);
    }
  });

  test("the editor render is not the write, and the action does not touch the database itself", () => {
    const page = readFileSync(path.join(root, "app/edit/page.tsx"), "utf8");
    const screen = readFileSync(path.join(root, "app/edit/edit-screen.tsx"), "utf8");
    const form = readFileSync(path.join(root, "app/edit/pick-form.tsx"), "utf8");
    const actions = readFileSync(path.join(root, "app/edit/pick-actions.ts"), "utf8");

    expect(page).toContain("clubMonthStart");
    expect(page).toContain("clubTimeZone");
    expect(page).not.toContain("requireRecordKeeper");
    expect(screen).not.toContain("requireRecordKeeper");
    expect(screen).not.toContain("getDb");
    expect(form).not.toContain("requireRecordKeeper");
    expect(form).not.toContain("getDb");
    expect(actions).toContain("savePick");
    expect(actions).toContain("deletePick");
    expect(actions).toContain("RecordKeeperRequiredError");
    expect(actions).toContain("redirect(");
    expect(actions).not.toContain("getDb(");
    expect(actions).not.toContain(".insert(");
    expect(actions).not.toContain(".update(");
    expect(actions).not.toContain(".delete(");
  });
});

function functionBody(source: string, name: string): string {
  const marker = `export async function ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`missing ${name}`);
  const rest = source.slice(start + marker.length);
  const next = rest.search(/\nexport async function |\nfunction storeFrom/);
  return next === -1 ? rest : rest.slice(0, next);
}
