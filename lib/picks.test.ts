import { describe, expect, test } from "vitest";
import { CLUB_TIMEZONE } from "./club-date";
import { loadFeaturedPick, selectFeaturedPick, toHero, type PickRecord } from "./picks";

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
    expect(state).toMatchObject({ status: "ready", hero: { kind: "book", title: "Title 2026-10-01" } });
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
