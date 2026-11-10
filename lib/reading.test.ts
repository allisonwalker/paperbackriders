import { describe, expect, test, vi } from "vitest";
import { CLUB_TIMEZONE } from "./club-date";
import { loadReadingTotals, readingTotals, type ReadingPick } from "./reading";

function book(month: string, overrides: Partial<ReadingPick> = {}): ReadingPick {
  return {
    month,
    kind: "book",
    pageCount: 100,
    genre: "Fiction",
    ...overrides,
  };
}

function prompt(month: string): ReadingPick {
  return { month, kind: "prompt", pageCount: null, genre: null };
}

function monthAt(index: number): string {
  const year = 2025 + Math.floor(index / 12);
  const month = String((index % 12) + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

const november = new Date("2026-11-08T20:00:00.000Z");
const currentMonth = "2026-11-01";

describe("reading totals", () => {
  test("counts books and sums pages for this month and earlier", () => {
    const totals = readingTotals(
      [
        book("2026-09-01", { pageCount: 200, genre: "Mystery" }),
        book("2026-11-01", { pageCount: 50, genre: "Mystery" }),
        book("2026-12-01", { pageCount: 999, genre: "Mystery" }),
      ],
      currentMonth,
    );

    expect(totals.bookCount).toBe(2);
    expect(totals.pageTotal).toBe(250);
    expect(totals.genres).toEqual([{ label: "Mystery", count: 2 }]);
  });

  test("leaves a future month out of every total", () => {
    const totals = readingTotals(
      [book("2026-12-01", { pageCount: 400, genre: "Fantasy" }), prompt("2027-01-01")],
      currentMonth,
    );

    expect(totals).toEqual({ bookCount: 0, pageTotal: 0, genres: [] });
  });

  test("does not count a prompt, and a null page count adds nothing", () => {
    const totals = readingTotals(
      [
        prompt("2026-10-01"),
        book("2026-11-01", { pageCount: null, genre: null }),
        book("2026-09-01", { pageCount: 120, genre: "History" }),
      ],
      currentMonth,
    );

    expect(totals.bookCount).toBe(2);
    expect(totals.pageTotal).toBe(120);
    expect(totals.genres).toEqual([{ label: "History", count: 1 }]);
  });

  test("groups mixed-case spellings and shows the one that occurs most often", () => {
    const totals = readingTotals(
      [
        book("2026-08-01", { genre: "fantasy" }),
        book("2026-09-01", { genre: "Fantasy" }),
        book("2026-10-01", { genre: "  Fantasy  " }),
        book("2026-11-01", { genre: "FANTASY" }),
      ],
      currentMonth,
    );

    expect(totals.genres).toEqual([{ label: "Fantasy", count: 4 }]);
  });

  test("leaves a blank genre off the list without dropping the book", () => {
    const totals = readingTotals(
      [
        book("2026-10-01", { pageCount: 80, genre: "   " }),
        book("2026-11-01", { pageCount: 90, genre: null }),
      ],
      currentMonth,
    );

    expect(totals.bookCount).toBe(2);
    expect(totals.pageTotal).toBe(170);
    expect(totals.genres).toEqual([]);
  });

  test("orders genres by count, then label, and shows every group when there are fewer than five", () => {
    const totals = readingTotals(
      [
        book("2026-08-01", { genre: "Poetry" }),
        book("2026-09-01", { genre: "Essays" }),
        book("2026-10-01", { genre: "Poetry" }),
        book("2026-11-01", { genre: "History" }),
      ],
      currentMonth,
    );

    expect(totals.genres).toEqual([
      { label: "Poetry", count: 2 },
      { label: "Essays", count: 1 },
      { label: "History", count: 1 },
    ]);
  });

  test("keeps a tie at fifth place, so the list can run past five", () => {
    const genres = [
      ...Array<string>(5).fill("Mystery"),
      ...Array<string>(4).fill("Fantasy"),
      ...Array<string>(3).fill("History"),
      ...Array<string>(2).fill("Romance"),
      ...Array<string>(2).fill("Poetry"),
      ...Array<string>(2).fill("Science"),
      "Essays",
    ];
    const rows = genres.map((genre, index) => book(monthAt(index), { genre, pageCount: 10 }));

    const totals = readingTotals(rows, currentMonth);

    expect(totals.bookCount).toBe(19);
    expect(totals.pageTotal).toBe(190);
    expect(totals.genres).toEqual([
      { label: "Mystery", count: 5 },
      { label: "Fantasy", count: 4 },
      { label: "History", count: 3 },
      { label: "Poetry", count: 2 },
      { label: "Romance", count: 2 },
      { label: "Science", count: 2 },
    ]);
  });

  test("uses the earlier spelling when two spellings occur equally often", () => {
    const totals = readingTotals(
      [book("2026-10-01", { genre: "sci-fi" }), book("2026-11-01", { genre: "Sci-Fi" })],
      currentMonth,
    );

    expect(totals.genres).toEqual([{ label: "Sci-Fi", count: 2 }]);
  });

  test("uses the club calendar and still drops a pick after the current one", async () => {
    const state = await loadReadingTotals({
      now: new Date("2026-11-01T06:30:00.000Z"),
      timeZone: CLUB_TIMEZONE,
      loadRows: async () => [
        book("2026-10-01", { pageCount: 40, genre: "Memoir" }),
        book("2026-11-01", { pageCount: 400, genre: "Memoir" }),
      ],
    });

    expect(state).toEqual({
      status: "ready",
      bookCount: 1,
      pageTotal: 40,
      genres: [{ label: "Memoir", count: 1 }],
    });
  });

  test("returns zeroes when the read succeeds and no books are included", async () => {
    const state = await loadReadingTotals({
      now: november,
      timeZone: CLUB_TIMEZONE,
      loadRows: async () => [prompt("2026-11-01"), book("2026-12-01")],
    });

    expect(state).toEqual({ status: "ready", bookCount: 0, pageTotal: 0, genres: [] });
  });

  test("returns an error and no numbers when the query fails", async () => {
    const state = await loadReadingTotals({
      now: november,
      timeZone: CLUB_TIMEZONE,
      loadRows: async () => {
        throw new Error("connection refused");
      },
    });

    expect(state).toEqual({ status: "error" });
    expect(state).not.toHaveProperty("bookCount");
  });

  test("does not log a database url when the query fails", async () => {
    const secret = "postgres://user:password@db.example/paperback";
    const logged: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(...args);
    });

    try {
      const state = await loadReadingTotals({
        now: november,
        timeZone: CLUB_TIMEZONE,
        loadRows: async () => {
          throw new Error(`connect ${secret}`);
        },
      });

      expect(state).toEqual({ status: "error" });
      expect(logged.join(" ")).not.toContain(secret);
      expect(logged.join(" ")).not.toContain("DATABASE_URL");
    } finally {
      spy.mockRestore();
    }
  });
});
