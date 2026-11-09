import { describe, expect, test } from "vitest";
import { canSearchKind, fieldsFromMatch, type BookMatch } from "./match";

const match: BookMatch = {
  lookupKey: "OL45883W",
  title: "The Left Hand of Darkness",
  author: "Ursula K. Le Guin",
  publishedYear: 1969,
  coverUrl: "https://covers.openlibrary.org/b/id/8739161-L.jpg",
  pageCount: 304,
  genre: "Science fiction",
};

describe("choosing a match", () => {
  test("copies the chosen work onto the form fields", () => {
    expect(fieldsFromMatch(match)).toEqual({
      title: "The Left Hand of Darkness",
      author: "Ursula K. Le Guin",
      publishedYear: "1969",
      pageCount: "304",
      genre: "Science fiction",
      coverUrl: "https://covers.openlibrary.org/b/id/8739161-L.jpg",
      lookupSource: "open_library",
      lookupKey: "OL45883W",
    });
  });

  test("drops a cover on any other host and refuses a key that is not an Open Library work", () => {
    expect(fieldsFromMatch({ ...match, coverUrl: "https://evil.example/cover.jpg" })?.coverUrl).toBe("");
    expect(fieldsFromMatch({ ...match, coverUrl: null })?.coverUrl).toBe("");
    expect(fieldsFromMatch({ ...match, lookupKey: "https://evil.example/works/OL45883W" })).toBeNull();
    expect(fieldsFromMatch({ ...match, lookupKey: "OL45883M" })).toBeNull();
  });

  test("only a book kind may search", () => {
    expect(canSearchKind("book")).toBe(true);
    expect(canSearchKind("prompt")).toBe(false);
    expect(canSearchKind("")).toBe(false);
    expect(canSearchKind(undefined)).toBe(false);
  });
});
