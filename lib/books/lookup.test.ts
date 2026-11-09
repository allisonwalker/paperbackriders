import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { isOpenLibrarySearchUrl, searchBooksForRecordKeeper } from "./lookup";

const root = path.resolve(import.meta.dirname, "../..");
const databaseUrl = "postgres://user:password@db.example/paperback";
const authSecret = "better-auth-secret-value";
const sessionToken = "session.token.value";
const magicLink = "https://books.example/api/auth/magic-link/verify?token=magic-token-value";

const keeper = async () => ({ email: "keeper@example.com" });

function doc(overrides: Record<string, unknown> = {}) {
  return {
    key: "/works/OL45883W",
    title: "The Left Hand of Darkness",
    author_name: ["Ursula K. Le Guin"],
    first_publish_year: 1969,
    cover_i: 8739161,
    number_of_pages_median: 304,
    subject: ["Science fiction", "Fiction"],
    cover_url: "https://evil.example/cover.jpg",
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200, url = ""): Response {
  const response = new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
  if (url) Object.defineProperty(response, "url", { value: url });
  return response;
}

function fetchSpy(response: Response | (() => Response | Promise<Response>)) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return typeof response === "function" ? response() : response;
  };
  return { calls, fetchImpl };
}

function keeperOptions(fetchImpl: typeof fetch, readSession: typeof keeper = keeper) {
  return { fetch: fetchImpl, readSession, allowlisted: "keeper@example.com" };
}

describe("Open Library search URL", () => {
  test("allows only https://openlibrary.org/search.json", () => {
    expect(isOpenLibrarySearchUrl(new URL("https://openlibrary.org/search.json"))).toBe(true);
    expect(isOpenLibrarySearchUrl(new URL("https://openlibrary.org/search.json?q=Dune"))).toBe(true);
    expect(isOpenLibrarySearchUrl(new URL("http://openlibrary.org/search.json"))).toBe(false);
    expect(isOpenLibrarySearchUrl(new URL("https://evil.example/search.json"))).toBe(false);
    expect(isOpenLibrarySearchUrl(new URL("https://openlibrary.org.evil.example/search.json"))).toBe(false);
    expect(isOpenLibrarySearchUrl(new URL("https://covers.openlibrary.org/b/id/1-L.jpg"))).toBe(false);
    expect(isOpenLibrarySearchUrl(new URL("https://user:pass@openlibrary.org/search.json"))).toBe(false);
    expect(isOpenLibrarySearchUrl(new URL("https://openlibrary.org:444/search.json"))).toBe(false);
    expect(isOpenLibrarySearchUrl(new URL("https://openlibrary.org/works/OL1W.json"))).toBe(false);
  });
});

describe("search results", () => {
  test("returns a short list and does not choose or fetch a cover itself", async () => {
    const { calls, fetchImpl } = fetchSpy(
      jsonResponse({
        docs: [
          doc(),
          doc({
            key: "/works/OL27448W",
            title: "Good Omens",
            author_name: ["Terry Pratchett", "Neil Gaiman"],
            first_publish_year: 1990,
            cover_i: 12,
            number_of_pages_median: 412,
            subject: ["https://evil.example/tag", "Humor"],
          }),
        ],
      }),
    );

    const result = await searchBooksForRecordKeeper(
      { query: "  left hand   of darkness ", kind: "book" },
      keeperOptions(fetchImpl),
    );

    expect(result).toEqual({
      status: "matches",
      matches: [
        {
          lookupKey: "OL45883W",
          title: "The Left Hand of Darkness",
          author: "Ursula K. Le Guin",
          publishedYear: 1969,
          coverUrl: "https://covers.openlibrary.org/b/id/8739161-L.jpg",
          pageCount: 304,
          genre: "Science fiction",
        },
        {
          lookupKey: "OL27448W",
          title: "Good Omens",
          author: "Terry Pratchett, Neil Gaiman",
          publishedYear: 1990,
          coverUrl: "https://covers.openlibrary.org/b/id/12-L.jpg",
          pageCount: 412,
          genre: "Humor",
        },
      ],
    });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]?.url ?? "");
    expect(url.origin).toBe("https://openlibrary.org");
    expect(url.pathname).toBe("/search.json");
    expect(url.searchParams.get("q")).toBe("left hand of darkness");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(calls[0]?.init?.redirect).toBe("manual");
    expect(calls[0]?.init?.credentials).toBe("omit");
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
    expect(JSON.stringify(calls)).not.toContain("evil.example");
  });

  test("a query that looks like a URL is still sent only as the search text", async () => {
    const { calls, fetchImpl } = fetchSpy(jsonResponse({ docs: [] }));
    const query = `https://evil.example/search.json?token=${sessionToken}`;

    const result = await searchBooksForRecordKeeper({ query, kind: "book" }, keeperOptions(fetchImpl));

    expect(result).toEqual({ status: "empty" });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]?.url ?? "");
    expect(url.origin).toBe("https://openlibrary.org");
    expect(url.pathname).toBe("/search.json");
    expect(url.searchParams.get("q")).toBe(query);
    expect(url.searchParams.get("limit")).toBe("5");
  });

  test("keeps at most five matches and skips records that are not works", async () => {
    const docs = Array.from({ length: 8 }, (_, index) =>
      doc({ key: `/works/OL${index + 1}W`, title: `Book ${index + 1}`, cover_i: index + 1 }),
    );
    docs.push(doc({ key: "/books/OL999M", title: "Edition" }));
    docs.push(doc({ key: "https://evil.example/works/OL1W", title: "Off host" }));
    const { calls, fetchImpl } = fetchSpy(jsonResponse({ docs }));

    const result = await searchBooksForRecordKeeper({ query: "books", kind: "book" }, keeperOptions(fetchImpl));

    expect(result.status).toBe("matches");
    if (result.status !== "matches") return;
    expect(result.matches).toHaveLength(5);
    expect(result.matches.map((match) => match.lookupKey)).toEqual(["OL1W", "OL2W", "OL3W", "OL4W", "OL5W"]);
    expect(calls).toHaveLength(1);
  });

  test("leaves out a cover, year, page count, or genre the record does not have", async () => {
    const { fetchImpl } = fetchSpy(
      jsonResponse({
        docs: [
          doc({
            cover_i: "8739161",
            first_publish_year: 1969.5,
            number_of_pages_median: 0,
            subject: ["https://evil.example/only"],
          }),
        ],
      }),
    );

    const result = await searchBooksForRecordKeeper({ query: "Dune", kind: "book" }, keeperOptions(fetchImpl));

    expect(result).toEqual({
      status: "matches",
      matches: [
        {
          lookupKey: "OL45883W",
          title: "The Left Hand of Darkness",
          author: "Ursula K. Le Guin",
          publishedYear: null,
          coverUrl: null,
          pageCount: null,
          genre: null,
        },
      ],
    });
  });
});

describe("search does not run unless a signed-in record keeper is looking up a book", () => {
  test("a prompt month does not call Open Library or read the session", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const readSession = vi.fn(async () => {
      throw new Error(databaseUrl);
    });

    const result = await searchBooksForRecordKeeper(
      { query: "Dune", kind: "prompt" },
      { fetch: fetchImpl, readSession, allowlisted: "keeper@example.com" },
    );

    expect(result).toEqual({ status: "skipped" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readSession).not.toHaveBeenCalled();
  });

  test("a stranger and a signed-out caller cannot search", async () => {
    for (const readSession of [async () => null, async () => ({ email: "member@example.com" })]) {
      const fetchImpl = vi.fn<typeof fetch>();
      const result = await searchBooksForRecordKeeper(
        { query: "https://evil.example", kind: "book" },
        { fetch: fetchImpl, readSession, allowlisted: "keeper@example.com" },
      );
      expect(result).toEqual({ status: "forbidden" });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  test("a blank or oversized query does not call Open Library", async () => {
    for (const query of ["  ", "x".repeat(201)]) {
      const fetchImpl = vi.fn<typeof fetch>();
      const result = await searchBooksForRecordKeeper({ query, kind: "book" }, keeperOptions(fetchImpl));
      expect(result.status === "blank" || result.status === "too-long").toBe(true);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });
});

describe("a failed search stays usable and does not log secrets", () => {
  test("a down catalog, a redirect, and a bad payload are unavailable", async () => {
    const secrets = `${databaseUrl} ${authSecret} ${sessionToken} ${magicLink}`;
    const cases: Array<() => Response | Promise<Response>> = [
      () => Promise.reject(new Error(secrets)),
      () => jsonResponse({ error: secrets }, 500),
      () => new Response(null, { status: 302, headers: { Location: "https://evil.example/collect" } }),
      () => jsonResponse({}, 200, "https://evil.example/search.json"),
      () => new Response(secrets, { status: 200, headers: { "content-type": "application/json" } }),
    ];

    for (const respond of cases) {
      const fetchImpl = vi.fn<typeof fetch>(async () => respond());
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        const result = await searchBooksForRecordKeeper({ query: secrets, kind: "book" }, keeperOptions(fetchImpl));
        expect(result).toEqual({ status: "unavailable" });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const logged = spy.mock.calls.flat().map((part) => JSON.stringify(part)).join(" ");
        expect(logged).toContain("Open Library search failed");
        expect(logged).not.toContain(databaseUrl);
        expect(logged).not.toContain(authSecret);
        expect(logged).not.toContain(sessionToken);
        expect(logged).not.toContain(magicLink);
        expect(logged).not.toContain("evil.example");
      } finally {
        spy.mockRestore();
      }
    }
  });
});

describe("where Open Library may be requested", () => {
  test("the search URL lives only in the lookup adapter, and no route exposes it", () => {
    const files = sourceFiles(path.join(root, "app")).concat(sourceFiles(path.join(root, "lib")));
    const mentions = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("openlibrary.org/search") || source.includes("search.json");
    });

    expect(mentions.map((file) => path.relative(root, file))).toEqual(["lib/books/lookup.ts"]);

    const adapter = readFileSync(path.join(root, "lib/books/lookup.ts"), "utf8");
    expect(adapter).toContain('redirect: "manual"');
    expect(adapter).toContain('credentials: "omit"');
    expect(adapter).not.toContain("goodreads");
    expect(adapter).not.toMatch(/DATABASE_URL|BETTER_AUTH|RESEND_API_KEY/);
    expect(adapter).not.toContain("savePick");
    expect(adapter).not.toContain("getDb");

    const action = readFileSync(path.join(root, "app/edit/lookup-action.ts"), "utf8");
    expect(action).toContain("use server");
    expect(action).toContain("searchBooksForRecordKeeper");
    expect(action).not.toMatch(/\bfetch\s*\(/);

    for (const file of ["app/page.tsx", "app/public-page.tsx", "lib/picks.ts", "lib/meeting.ts"]) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).not.toContain("books/lookup");
      expect(source).not.toContain("searchBooks");
    }
  });
});

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sourceFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) files.push(full);
  }
  return files;
}
