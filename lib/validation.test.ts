import { describe, expect, test } from "vitest";
import { monthInputValue, normalizeMonth, parsePickForm, pickInputFromForm, PICK_TEXT_LIMITS } from "./validation";

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
    ...overrides,
  };
}

function prompt(overrides: Record<string, unknown> = {}) {
  return {
    month: "2026-03",
    kind: "prompt",
    promptText: "  Read a book from the year you were born.\n",
    title: "Should not be stored",
    author: "Should not be stored",
    publishedYear: "1990",
    coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
    pageCount: "100",
    genre: "Memoir",
    ...overrides,
  };
}

describe("club month", () => {
  test("stores the first day of the named month", () => {
    expect(normalizeMonth("2026-11")).toBe("2026-11-01");
    expect(normalizeMonth(" 2026-11-01 ")).toBe("2026-11-01");
    expect(normalizeMonth("2026-11-15")).toBe("2026-11-01");
    expect(normalizeMonth("2024-02-29")).toBe("2024-02-01");
    expect(monthInputValue("2026-11-01")).toBe("2026-11");
  });

  test("rejects a month that is not a real calendar month, including a UTC instant", () => {
    expect(normalizeMonth("2026-11-01T00:00:00.000Z")).toBeNull();
    expect(normalizeMonth("2025-02-29")).toBeNull();
    expect(normalizeMonth("2026-13")).toBeNull();
    expect(normalizeMonth("2026-02-31")).toBeNull();
    expect(normalizeMonth("")).toBeNull();
    expect(normalizeMonth(202611)).toBeNull();
  });
});

describe("book and prompt rules", () => {
  test("a book needs a title and an author, and optional fields may be empty", () => {
    const parsed = parsePickForm(book());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.coverDropped).toBe(false);
    expect(parsed.draft).toEqual({
      kind: "book",
      month: "2026-11-01",
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
  });

  test("a book keeps a year, a page count, a genre, and an Open Library cover", () => {
    const parsed = parsePickForm(
      book({
        publishedYear: " 1969 ",
        pageCount: "304",
        genre: "  Science fiction ",
        coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
      }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.draft.kind !== "book") return;
    expect(parsed.coverDropped).toBe(false);
    expect(parsed.draft.publishedYear).toBe(1969);
    expect(parsed.draft.pageCount).toBe(304);
    expect(parsed.draft.genre).toBe("Science fiction");
    expect(parsed.draft.coverUrl).toBe("https://covers.openlibrary.org/b/id/1-L.jpg");
    expect(parsed.draft.promptText).toBeNull();
  });

  test("drops a cover whose host is not covers.openlibrary.org and still accepts the book", () => {
    const parsed = parsePickForm(book({ coverUrl: "https://example.com/cover.jpg" }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.draft.kind !== "book") return;
    expect(parsed.coverDropped).toBe(true);
    expect(parsed.draft.coverUrl).toBeNull();
    expect(parsed.draft.title).toBe("The Left Hand of Darkness");
  });

  test("a prompt keeps its text and none of the book fields", () => {
    const parsed = parsePickForm(prompt());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.draft).toEqual({
      kind: "prompt",
      month: "2026-03-01",
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

  test("rejects a book without a title or an author, and a prompt without text", () => {
    expect(parsePickForm(book({ title: "  " }))).toMatchObject({
      ok: false,
      errors: { title: "Enter a title." },
    });
    expect(parsePickForm(book({ author: "" }))).toMatchObject({
      ok: false,
      errors: { author: "Enter an author." },
    });
    expect(parsePickForm(prompt({ promptText: " \n " }))).toMatchObject({
      ok: false,
      errors: { promptText: "Enter the prompt." },
    });
    expect(parsePickForm(book({ kind: "chapter" }))).toMatchObject({
      ok: false,
      errors: { kind: "Choose a book or a prompt." },
    });
  });

  test("rejects a year or page count that is not a whole number in range", () => {
    expect(parsePickForm(book({ publishedYear: "1969.5" }))).toMatchObject({
      ok: false,
      errors: { publishedYear: "Enter a publication year as a whole number." },
    });
    expect(parsePickForm(book({ publishedYear: "1e3" }))).toMatchObject({ ok: false });
    expect(parsePickForm(book({ publishedYear: "0" }))).toMatchObject({ ok: false });
    expect(parsePickForm(book({ pageCount: "-5" }))).toMatchObject({
      ok: false,
      errors: { pageCount: "Enter the page count as a whole number." },
    });
    expect(parsePickForm(book({ title: "x".repeat(PICK_TEXT_LIMITS.title) })).ok).toBe(true);
    expect(parsePickForm(book({ title: "x".repeat(PICK_TEXT_LIMITS.title + 1) }))).toMatchObject({
      ok: false,
      errors: { title: "The title is too long." },
    });
  });

  test("reads the form fields, including a chosen Open Library work, and ignores a file input", () => {
    const form = new FormData();
    form.set("month", "2026-11");
    form.set("kind", "book");
    form.set("title", " Title ");
    form.set("author", " Author ");
    form.set("lookupSource", "open_library");
    form.set("lookupKey", "OL45883W");
    form.set("coverUrl", new Blob(["nope"]), "cover.jpg");

    expect(pickInputFromForm(form)).toEqual({
      month: "2026-11",
      kind: "book",
      title: " Title ",
      author: " Author ",
      publishedYear: "",
      coverUrl: "",
      pageCount: "",
      genre: "",
      promptText: "",
      lookupSource: "open_library",
      lookupKey: "OL45883W",
    });
  });

  test("stores an Open Library work id when she chose that match", () => {
    const parsed = parsePickForm(
      book({
        lookupSource: "open_library",
        lookupKey: " OL45883W ",
        publishedYear: "1969",
        genre: "Science fiction",
      }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.draft.kind !== "book") return;
    expect(parsed.draft.lookupSource).toBe("open_library");
    expect(parsed.draft.lookupKey).toBe("OL45883W");
    expect(parsed.draft.title).toBe("The Left Hand of Darkness");
  });

  test("a key that is not an Open Library work is saved as a hand entry", () => {
    for (const lookupKey of ["https://evil.example/works/OL45883W", "OL45883M", "OL45883W/../secret", ""]) {
      const parsed = parsePickForm(book({ lookupSource: "open_library", lookupKey }));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok || parsed.draft.kind !== "book") continue;
      expect(parsed.draft.lookupSource).toBe("manual");
      expect(parsed.draft.lookupKey).toBeNull();
    }
  });

  test("a prompt drops a lookup even when the form sends one", () => {
    const parsed = parsePickForm(prompt({ lookupSource: "open_library", lookupKey: "OL45883W" }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.lookupSource).toBeNull();
    expect(parsed.draft.lookupKey).toBeNull();
    expect(parsed.draft.kind).toBe("prompt");
  });
});
