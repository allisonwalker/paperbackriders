import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { WICKER_HUSBAND_COVER } from "../cover";
import { bookMatchFromDoc } from "./lookup";
import {
  catalogFillDatabaseUrl,
  catalogFillPatch,
  fillEmptyCovers,
  searchStoredBook,
  type CatalogFillPatch,
  type CatalogFillRow,
  type CatalogFillStore,
  type CatalogSearch,
} from "./catalog-fill";
import type { BookMatch } from "./match";

const root = path.resolve(import.meta.dirname, "../..");
const productionHost = "ep-live.example.neon.tech";
const previewHost = "ep-preview.example.neon.tech";
const secretUrl = `postgres://user:s3cret@${productionHost}/neondb`;
const previewUrl = `postgres://user:s3cret@${previewHost}/neondb`;

function row(overrides: Partial<CatalogFillRow> = {}): CatalogFillRow {
  return {
    id: "pick-1",
    kind: "book",
    title: "Dawn",
    author: "Octavia E. Butler",
    coverUrl: null,
    pageCount: null,
    lookupKey: null,
    lookupSource: null,
    alsoTitle: null,
    alsoAuthor: null,
    alsoCoverUrl: null,
    alsoPageCount: null,
    alsoLookupKey: null,
    alsoLookupSource: null,
    ...overrides,
  };
}

function work(overrides: Record<string, unknown> = {}): BookMatch {
  const match = bookMatchFromDoc({
    key: "/works/OL45883W",
    title: "Dawn",
    author_name: ["Octavia E. Butler"],
    cover_i: 42,
    number_of_pages_median: 248,
    subject: ["Science fiction"],
    cover_url: "https://evil.example/cover.jpg",
    ...overrides,
  });
  if (!match) throw new Error("Expected a parsed Open Library work");
  return match;
}

function memoryStore(rows: CatalogFillRow[]): CatalogFillStore & { saved: { id: string; patch: CatalogFillPatch }[] } {
  return {
    saved: [],
    async load() {
      return rows;
    },
    async save(id, patch) {
      this.saved.push({ id, patch });
      const current = rows.find((item) => item.id === id);
      if (current) Object.assign(current, patch);
    },
  };
}

describe("empty covers and page counts", () => {
  test("patches only a null cover or page count, and skips a prompt, a miss, and two matches", async () => {
    const dawn = work();
    const kept = row({
      id: "kept",
      title: "Piranesi",
      author: "Susanna Clarke",
      coverUrl: "https://covers.openlibrary.org/b/id/9-L.jpg",
      pageCount: 272,
      lookupKey: "OL1W",
      lookupSource: "manual",
    });
    const pageOnly = row({
      id: "page-only",
      title: "Kindred",
      author: "Octavia E. Butler",
      coverUrl: "https://covers.openlibrary.org/b/id/7-L.jpg",
      pageCount: null,
      lookupKey: "OL99W",
      lookupSource: "manual",
    });
    const coverOnly = row({
      id: "cover-only",
      title: "Wild Seed",
      author: "Octavia E. Butler",
      coverUrl: null,
      pageCount: 320,
      lookupKey: null,
      lookupSource: "manual",
    });
    const prompt = row({ id: "prompt", kind: "prompt", title: "Bring a poem", author: "the club", coverUrl: null, pageCount: null });
    const ambiguous = row({ id: "ambiguous", title: "Shadow of the Wind", author: "Carlos Ruiz Zafón" });
    const missing = row({ id: "missing", title: "Nobody Wrote This", author: "No Author" });
    const spaced = row({ id: "spaced", title: "  the   left hand of darkness ", author: "ursula k. le guin" });
    const failed = row({ id: "failed", title: "Stiff", author: "Mary Roach" });
    const emptyWork = row({ id: "empty-work", title: "Bliss Montage", author: "Ling Ma" });
    const rows = [row(), kept, pageOnly, coverOnly, prompt, ambiguous, missing, spaced, failed, emptyWork];
    const store = memoryStore(rows);
    const searched: string[] = [];
    const lines: string[] = [];

    const kindred = work({
      key: "/works/OL2W",
      title: "Kindred",
      author_name: ["Octavia E. Butler"],
      cover_i: 99,
      number_of_pages_median: 264,
    });
    const wildSeed = work({
      key: "/works/OL3W",
      title: "Wild Seed",
      author_name: ["Octavia E. Butler"],
      cover_i: 15,
      number_of_pages_median: 999,
    });
    const leftHand = work({
      key: "/works/OL4W",
      title: "The Left Hand of Darkness",
      author_name: ["Ursula K. Le Guin"],
      cover_i: 8,
      number_of_pages_median: 304,
    });
    const shadowA = work({ key: "/works/OL5W", title: "Shadow of the Wind", author_name: ["Carlos Ruiz Zafón"], cover_i: 5 });
    const shadowB = work({ key: "/works/OL6W", title: "shadow of the wind", author_name: ["Carlos  Ruiz Zafón"], cover_i: 6 });
    const otherAuthor = work({ key: "/works/OL7W", title: "Dawn", author_name: ["Someone Else"], cover_i: 1 });
    const bliss = work({
      key: "/works/OL8W",
      title: "Bliss Montage",
      author_name: ["Ling Ma"],
      cover_i: "nope",
      number_of_pages_median: 0,
    });

    const search: CatalogSearch = async (title) => {
      searched.push(title);
      if (title === "Dawn") return [otherAuthor, dawn];
      if (title === "Kindred") return [kindred];
      if (title === "Wild Seed") return [wildSeed];
      if (title === "Shadow of the Wind") return [shadowA, shadowB];
      if (title === "Nobody Wrote This") return [];
      if (title === "  the   left hand of darkness ") return [leftHand, otherAuthor];
      if (title === "Stiff") return null;
      if (title === "Bliss Montage") return [bliss];
      return [];
    };

    await expect(fillEmptyCovers(store, search, (line) => lines.push(line))).resolves.toBe(5);
    expect(searched).not.toContain("Piranesi");
    expect(searched).not.toContain("Bring a poem");
    expect(store.saved).toEqual([
      {
        id: "pick-1",
        patch: {
          coverUrl: "https://covers.openlibrary.org/b/id/42-L.jpg",
          pageCount: 248,
          lookupKey: "OL45883W",
          lookupSource: "open_library",
        },
      },
      {
        id: "page-only",
        patch: { pageCount: 264 },
      },
      {
        id: "cover-only",
        patch: {
          coverUrl: "https://covers.openlibrary.org/b/id/15-L.jpg",
          lookupKey: "OL3W",
        },
      },
      {
        id: "spaced",
        patch: {
          coverUrl: "https://covers.openlibrary.org/b/id/8-L.jpg",
          pageCount: 304,
          lookupKey: "OL4W",
          lookupSource: "open_library",
        },
      },
      {
        id: "empty-work",
        patch: {
          lookupKey: "OL8W",
          lookupSource: "open_library",
        },
      },
    ]);
    expect(lines).toEqual(["Skipped Shadow of the Wind.", "Skipped Nobody Wrote This."]);
    expect(JSON.stringify(store.saved)).not.toContain("Science fiction");
    expect(JSON.stringify(store.saved)).not.toContain("evil.example");
    expect(kept.coverUrl).toBe("https://covers.openlibrary.org/b/id/9-L.jpg");
    expect(kept.pageCount).toBe(272);
    expect(pageOnly.coverUrl).toBe("https://covers.openlibrary.org/b/id/7-L.jpg");
    expect(pageOnly.lookupKey).toBe("OL99W");
    expect(pageOnly.lookupSource).toBe("manual");
    expect(coverOnly.pageCount).toBe(320);
    expect(coverOnly.lookupSource).toBe("manual");

    const direct = catalogFillPatch(prompt, [dawn], [dawn]);
    expect(direct).toEqual({ patch: null, skipped: [] });

    store.saved.length = 0;
    await expect(fillEmptyCovers(store, search, (line) => lines.push(line))).resolves.toBe(0);
  });

  test("drops a cover on another host and a page count outside 1 to 100,000", () => {
    const hostile: BookMatch = {
      ...work({ cover_i: 42, number_of_pages_median: 100_000 }),
      coverUrl: "https://evil.example/cover.jpg",
      pageCount: 100_001,
    };
    const medium: BookMatch = {
      ...work({ number_of_pages_median: 10 }),
      coverUrl: "https://covers.openlibrary.org/b/id/42-M.jpg",
    };
    const httpCover: BookMatch = {
      ...work(),
      coverUrl: "http://covers.openlibrary.org/b/id/42-L.jpg",
    };

    expect(catalogFillPatch(row(), [hostile], null).patch).toEqual({
      lookupKey: "OL45883W",
      lookupSource: "open_library",
    });
    expect(catalogFillPatch(row({ id: "medium" }), [medium], null).patch?.coverUrl).toBeUndefined();
    expect(catalogFillPatch(row({ id: "http" }), [httpCover], null).patch?.coverUrl).toBeUndefined();
    expect(catalogFillPatch(row(), [work({ number_of_pages_median: 1 })], null).patch).toMatchObject({
      pageCount: 1,
      coverUrl: "https://covers.openlibrary.org/b/id/42-L.jpg",
    });
    expect(catalogFillPatch(row(), [work({ number_of_pages_median: 100_000 })], null).patch?.pageCount).toBe(100_000);

    const unparsed = bookMatchFromDoc({
      key: "/works/OL45883W",
      title: "Dawn",
      author_name: ["Octavia E. Butler"],
      cover_i: "42",
      number_of_pages_median: 12.5,
    });
    expect(unparsed?.coverUrl).toBeNull();
    expect(unparsed?.pageCount).toBeNull();
    expect(catalogFillPatch(row(), unparsed ? [unparsed] : [], null).patch).toEqual({
      lookupKey: "OL45883W",
      lookupSource: "open_library",
    });
  });

  test("fills the second book the same way and never writes the Wicker Husband file", async () => {
    const husband = work({
      key: "/works/OL77W",
      title: "The Wicker Husband",
      author_name: ["K. A. Applegate"],
      cover_i: 77,
      number_of_pages_median: 180,
    });
    const companion = work({
      key: "/works/OL88W",
      title: "The Employees",
      author_name: ["Olga Ravn"],
      cover_i: 88,
      number_of_pages_median: 136,
    });
    const keptCover = row({
      id: "october",
      title: "Somebody is Walking on Your Grave",
      author: "Mariana Enríquez",
      coverUrl: "https://covers.openlibrary.org/b/id/3-L.jpg",
      pageCount: 400,
      lookupKey: "OL10W",
      lookupSource: "open_library",
      alsoTitle: "The Wicker Husband",
      alsoAuthor: "K. A. Applegate",
      alsoCoverUrl: null,
      alsoPageCount: null,
    });
    const already = row({
      id: "already",
      title: "Dawn",
      author: "Octavia E. Butler",
      coverUrl: "https://covers.openlibrary.org/b/id/42-L.jpg",
      pageCount: 248,
      lookupKey: "OL45883W",
      lookupSource: "open_library",
      alsoTitle: "The  Wicker Husband",
      alsoAuthor: "k. a. applegate",
      alsoCoverUrl: WICKER_HUSBAND_COVER,
      alsoPageCount: null,
      alsoLookupKey: "OL1W",
      alsoLookupSource: "manual",
    });
    const second = row({
      id: "second",
      title: "Piranesi",
      author: "Susanna Clarke",
      coverUrl: "https://covers.openlibrary.org/b/id/9-L.jpg",
      pageCount: 272,
      lookupKey: "OL9W",
      lookupSource: "manual",
      alsoTitle: "The Employees",
      alsoAuthor: "Olga Ravn",
      alsoCoverUrl: null,
      alsoPageCount: null,
    });
    const store = memoryStore([keptCover, already, second]);
    const searched: string[] = [];
    const search: CatalogSearch = async (title) => {
      searched.push(title);
      if (title === "The Wicker Husband" || title === "The  Wicker Husband") return [husband];
      if (title === "The Employees") return [companion];
      return [];
    };

    await expect(fillEmptyCovers(store, search)).resolves.toBe(3);
    expect(searched).toEqual(["The Wicker Husband", "The  Wicker Husband", "The Employees"]);
    expect(store.saved).toEqual([
      {
        id: "october",
        patch: {
          alsoPageCount: 180,
          alsoLookupKey: "OL77W",
          alsoLookupSource: "open_library",
        },
      },
      {
        id: "already",
        patch: { alsoPageCount: 180 },
      },
      {
        id: "second",
        patch: {
          alsoCoverUrl: "https://covers.openlibrary.org/b/id/88-L.jpg",
          alsoPageCount: 136,
          alsoLookupKey: "OL88W",
          alsoLookupSource: "open_library",
        },
      },
    ]);
    expect(keptCover.alsoCoverUrl).toBeNull();
    expect(already.alsoCoverUrl).toBe(WICKER_HUSBAND_COVER);
    expect(already.alsoLookupKey).toBe("OL1W");
    expect(already.alsoLookupSource).toBe("manual");
    expect(JSON.stringify(store.saved)).not.toContain(WICKER_HUSBAND_COVER);
    expect(JSON.stringify(store.saved)).not.toContain("alsoGenre");
  });
});

describe("catalog fill runner", () => {
  test("is a local script, and the request stays on the Open Library search", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return Response.json({
        docs: [
          {
            key: "/works/OL45883W",
            title: "Dawn",
            author_name: ["Octavia E. Butler"],
            cover_i: 42,
            number_of_pages_median: 248,
          },
        ],
      });
    };

    const matches = await searchStoredBook("Dawn", "Octavia E. Butler", fetchImpl);
    expect(matches).toEqual([
      {
        lookupKey: "OL45883W",
        title: "Dawn",
        author: "Octavia E. Butler",
        publishedYear: null,
        coverUrl: "https://covers.openlibrary.org/b/id/42-L.jpg",
        pageCount: 248,
        genre: null,
      },
    ]);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]?.url ?? "");
    expect(url.origin).toBe("https://openlibrary.org");
    expect(url.pathname).toBe("/search.json");
    expect(url.searchParams.get("q")).toBe("Dawn Octavia E. Butler");
    expect(calls[0]?.init?.redirect).toBe("manual");

    const redirected: typeof fetch = async () => new Response(null, { status: 302, headers: { Location: "https://evil.example/search.json" } });
    await expect(searchStoredBook("Dawn", "Octavia E. Butler", redirected)).resolves.toBeNull();

    const script = readFileSync(path.join(root, "scripts/fill-empty-covers.ts"), "utf8");
    expect(script).toContain("catalogFillDatabaseUrl");
    expect(script).toContain("searchStoredBook");
    expect(script).not.toContain("NextRequest");
    expect(script).not.toContain("next/server");
    expect(script).not.toContain("search.json");

    const appFiles = filesUnder(path.join(root, "app")).filter((file) => /\.(ts|tsx)$/.test(file));
    for (const file of appFiles) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toContain("catalog-fill");
      expect(text).not.toContain("fillEmptyCovers");
      expect(text).not.toContain("fill-empty-covers");
    }
  });

  test("opens a local catalog and production only after the same restore check", () => {
    const local = {
      DATABASE_URL: previewUrl,
      PRODUCTION_DATABASE_HOST: productionHost,
    };
    const restored = {
      DATABASE_URL: secretUrl,
      PRODUCTION_DATABASE_HOST: "ep-live-pooler.example.neon.tech",
      CATALOG_RESTORE_HOST: "ep-restore.example.neon.tech",
    };

    expect(catalogFillDatabaseUrl(local)).toBe(previewUrl);
    expect(catalogFillDatabaseUrl(restored)).toBe(secretUrl);
  });

  test("refuses a deployment, and production without a restore, without echoing the url", () => {
    const cases = [
      () =>
        catalogFillDatabaseUrl({
          VERCEL: "1",
          DATABASE_URL: secretUrl,
          PRODUCTION_DATABASE_HOST: productionHost,
        }),
      () =>
        catalogFillDatabaseUrl({
          VERCEL_ENV: "preview",
          DATABASE_URL: previewUrl,
          PRODUCTION_DATABASE_HOST: productionHost,
        }),
      () =>
        catalogFillDatabaseUrl({
          DATABASE_URL: secretUrl,
          PRODUCTION_DATABASE_HOST: productionHost,
        }),
    ];

    for (const run of cases) {
      let thrown: unknown;
      try {
        run();
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).not.toContain("s3cret");
      expect(message).not.toContain("postgres://");
    }
  });
});

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(full);
    return [full];
  });
}
