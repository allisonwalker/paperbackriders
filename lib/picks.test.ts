import { describe, expect, test, vi } from "vitest";
import { CLUB_TIMEZONE } from "./club-date";
import {
  loadEditorPicks,
  loadFeaturedPick,
  loadHistory,
  mapPickRow,
  selectFeaturedPick,
  toHero,
  toHistory,
  type PickRecord,
} from "./picks";

function pick(month: string, overrides: Partial<PickRecord> = {}): PickRecord {
  return {
    id: month,
    month,
    kind: "book",
    promptText: null,
    title: `Title ${month}`,
    author: "Author",
    publishedYear: 2020,
    coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
    pageCount: 320,
    genre: "Fiction",
    lookupSource: null,
    lookupKey: null,
    ...overrides,
  };
}

const november = new Date("2026-11-08T20:00:00.000Z");

describe("featured pick", () => {
  test("chooses the pick for the current club month", () => {
    const rows = [pick("2026-09-01"), pick("2026-11-01"), pick("2026-12-01")];
    expect(selectFeaturedPick(rows, "2026-11-01")?.month).toBe("2026-11-01");
  });

  test("falls back to the latest earlier month", () => {
    const rows = [pick("2026-09-01"), pick("2026-10-01"), pick("2026-12-01")];
    expect(selectFeaturedPick(rows, "2026-11-01")?.month).toBe("2026-10-01");
  });

  test("does not feature a future month", () => {
    expect(selectFeaturedPick([pick("2026-12-01")], "2026-11-01")).toBeNull();
  });

  test("returns nothing when the club has no picks", () => {
    expect(selectFeaturedPick([], "2026-11-01")).toBeNull();
  });

  test("uses the club calendar when loading", async () => {
    const seen: string[] = [];
    const state = await loadFeaturedPick({
      now: november,
      timeZone: CLUB_TIMEZONE,
      loadRows: async (currentMonth) => {
        seen.push(currentMonth);
        return [pick("2026-10-01"), pick("2026-12-01")];
      },
    });

    expect(seen).toEqual(["2026-11-01"]);
    expect(state).toMatchObject({
      status: "ready",
      month: "2026-10-01",
      pickLabel: "November\u2019s pick",
      hero: { kind: "book", title: "Title 2026-10-01", monthLabel: "October 2026" },
    });
  });

  test("says the page could not load when the query fails", async () => {
    const state = await loadFeaturedPick({
      now: november,
      timeZone: CLUB_TIMEZONE,
      loadRows: async () => {
        throw new Error("connection refused");
      },
    });

    expect(state).toEqual({ status: "error" });
  });

  test("is empty when the query succeeds and there is no pick", async () => {
    const state = await loadFeaturedPick({
      now: november,
      timeZone: CLUB_TIMEZONE,
      loadRows: async () => [],
    });

    expect(state).toEqual({ status: "empty" });
  });
});

describe("reading history", () => {
  test("orders every month newest first, including a future month, and marks the featured month", () => {
    const entries = toHistory(
      [
        pick("2026-09-01", { title: "September", pageCount: null }),
        pick("2026-12-01", { title: "December", pageCount: 180 }),
        pick("2026-11-01", { title: "November" }),
      ],
      "2026-10-01",
    );

    expect(entries.map((entry) => entry.month)).toEqual(["2026-12-01", "2026-11-01", "2026-09-01"]);
    expect(entries.every((entry) => entry.marked === false)).toBe(true);

    const marked = toHistory(
      [pick("2026-11-01"), pick("2026-12-01"), pick("2026-10-01", { title: "Fallback" })],
      "2026-11-01",
    );
    expect(marked.find((entry) => entry.month === "2026-11-01")?.marked).toBe(true);
    expect(marked.find((entry) => entry.month === "2026-12-01")?.marked).toBe(false);
  });

  test("keeps a book to month, title, author, and page count, and a prompt to its text", () => {
    const entries = toHistory(
      [
        pick("2026-10-01", {
          title: "The Prestige",
          author: "Christopher Priest",
          pageCount: 404,
          publishedYear: 1995,
          genre: "Fiction",
          coverUrl: "https://covers.openlibrary.org/b/id/42-L.jpg",
        }),
        pick("2026-03-01", {
          kind: "prompt",
          promptText: "  Read a book from the year you were born.  ",
          title: null,
          author: null,
          publishedYear: null,
          coverUrl: null,
          pageCount: null,
          genre: null,
        }),
      ],
      null,
    );

    expect(entries).toEqual([
      {
        kind: "book",
        month: "2026-10-01",
        monthLabel: "October 2026",
        title: "The Prestige",
        author: "Christopher Priest",
        pageCount: 404,
        marked: false,
      },
      {
        kind: "prompt",
        month: "2026-03-01",
        monthLabel: "March 2026",
        promptText: "Read a book from the year you were born.",
        marked: false,
      },
    ]);
  });

  test("is an empty list when the club has no picks", () => {
    expect(toHistory([], null)).toEqual([]);
  });

  test("returns every pick for the editor and does not call a failed load empty", async () => {
    const rows = [pick("2026-11-01"), pick("2026-10-01")];
    await expect(loadEditorPicks({ loadRows: async () => rows })).resolves.toEqual({
      status: "ready",
      picks: rows,
    });

    await expect(
      loadEditorPicks({
        loadRows: async () => {
          throw new Error("connection refused");
        },
      }),
    ).resolves.toEqual({ status: "error" });
  });

  test("says the history could not load when the query fails", async () => {
    const state = await loadHistory({
      loadRows: async () => {
        throw new Error("connection refused");
      },
    });

    expect(state).toEqual({ status: "error" });
  });

  test("returns every stored pick when the query succeeds", async () => {
    const state = await loadHistory({
      markedMonth: "2026-11-01",
      loadRows: async () => [pick("2026-11-01"), pick("2026-12-01")],
    });

    expect(state.status).toBe("ready");
    if (state.status !== "ready") {
      return;
    }
    expect(state.entries.map((entry) => entry.month)).toEqual(["2026-12-01", "2026-11-01"]);
    expect(state.entries[1]?.marked).toBe(true);
  });
});

describe("hero fields", () => {
  test("shows a book's filled fields and omits the empty ones", () => {
    const hero = toHero(
      pick("2026-10-01", {
        publishedYear: null,
        pageCount: null,
        genre: "  ",
        coverUrl: null,
      }),
    );

    expect(hero).toEqual({
      kind: "book",
      monthLabel: "October 2026",
      title: "Title 2026-10-01",
      author: "Author",
      publishedYear: null,
      pageCount: null,
      genre: null,
      coverUrl: null,
    });
  });

  test("drops a cover whose host is not covers.openlibrary.org", () => {
    const hero = toHero(pick("2026-10-01", { coverUrl: "https://example.com/cover.jpg" }));
    expect(hero).toMatchObject({ kind: "book", coverUrl: null });
  });

  test("keeps a stored Open Library id on the record and does not ask Open Library to draw it", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));
    try {
      const record = mapPickRow({
        id: "pick-1",
        month: "2026-11-01",
        kind: "book",
        promptText: null,
        title: "The Left Hand of Darkness",
        author: "Ursula K. Le Guin",
        publishedYear: 1969,
        coverUrl: "https://covers.openlibrary.org/b/id/8739161-L.jpg",
        pageCount: 304,
        genre: "Science fiction",
        lookupSource: "open_library",
        lookupKey: "OL45883W",
      });

      expect(record.lookupSource).toBe("open_library");
      expect(record.lookupKey).toBe("OL45883W");
      expect(toHero(record)).toEqual({
        kind: "book",
        monthLabel: "November 2026",
        title: "The Left Hand of Darkness",
        author: "Ursula K. Le Guin",
        publishedYear: 1969,
        pageCount: 304,
        genre: "Science fiction",
        coverUrl: "https://covers.openlibrary.org/b/id/8739161-L.jpg",
      });
      expect(toHero(record)).not.toHaveProperty("lookupKey");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("shows prompt text and none of the book fields", () => {
    const hero = toHero(
      pick("2026-03-01", {
        kind: "prompt",
        promptText: "  Read a book from the year you were born.  ",
        title: "Should not show",
        author: "Should not show",
        publishedYear: 1990,
        coverUrl: "https://covers.openlibrary.org/b/id/9-L.jpg",
        pageCount: 100,
        genre: "Memoir",
      }),
    );

    expect(hero).toEqual({
      kind: "prompt",
      monthLabel: "March 2026",
      promptText: "Read a book from the year you were born.",
    });
  });
});
