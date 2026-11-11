import { WICKER_HUSBAND_COVER, displayCoverUrl, OPEN_LIBRARY_COVER_HOST } from "../cover";
import type { ProcessEnv } from "../database-isolation";
import { openLibraryWorkId } from "../validation";
import { SEARCH_QUERY_MAX, type BookMatch } from "./match";
import { searchOpenLibrary } from "./lookup";
import { recordedGenreDatabaseUrl } from "../recorded-genres";

/**
 * One-time fill of empty covers and page counts on books already stored.
 * Public pages do not call this. A saved cover, page count, title, author,
 * year, or genre is left as it is.
 */

const LARGE_COVER = /^\/b\/id\/[1-9]\d{0,8}-L\.jpg$/;
const WICKER_HUSBAND_TITLE = catalogIdentity("The Wicker Husband");

export type CatalogFillRow = {
  id: string;
  kind: "book" | "prompt";
  title: string | null;
  author: string | null;
  coverUrl: string | null;
  pageCount: number | null;
  lookupKey: string | null;
  lookupSource: string | null;
  alsoTitle: string | null;
  alsoAuthor: string | null;
  alsoCoverUrl: string | null;
  alsoPageCount: number | null;
  alsoLookupKey: string | null;
  alsoLookupSource: string | null;
};

/** Fields this fill may write. Title, author, year, and genre are never among them. */
export type CatalogFillPatch = {
  coverUrl?: string;
  pageCount?: number;
  lookupKey?: string;
  lookupSource?: "open_library";
  alsoCoverUrl?: string;
  alsoPageCount?: number;
  alsoLookupKey?: string;
  alsoLookupSource?: "open_library";
};

export type CatalogFillStore = {
  load(): Promise<readonly CatalogFillRow[]>;
  save(id: string, patch: CatalogFillPatch): Promise<void>;
};

/** `null` means the search failed or could not be sent. An empty list is a real miss. */
export type CatalogSearch = (title: string, author: string) => Promise<readonly BookMatch[] | null>;

type StoredBook = {
  title: string | null;
  author: string | null;
  coverUrl: string | null;
  pageCount: number | null;
  lookupKey: string | null;
  lookupSource: string | null;
};

type BookPatch = {
  coverUrl?: string;
  pageCount?: number;
  lookupKey?: string;
  lookupSource?: "open_library";
};

export function catalogSearchQuery(title: string, author: string): string | null {
  const combined = collapse(title + " " + author);
  if (combined && combined.length <= SEARCH_QUERY_MAX) return combined;
  const titleOnly = collapse(title);
  if (titleOnly && titleOnly.length <= SEARCH_QUERY_MAX) return titleOnly;
  return null;
}

/**
 * Search one stored book through the editor's Open Library adapter.
 * The request URL and the redirect rule stay in that adapter.
 */
export async function searchStoredBook(
  title: string,
  author: string,
  fetchImpl: typeof fetch,
): Promise<readonly BookMatch[] | null> {
  const query = catalogSearchQuery(title, author);
  if (!query) return null;
  const result = await searchOpenLibrary(query, fetchImpl);
  if (result.status === "matches") return result.matches;
  if (result.status === "empty") return [];
  return null;
}

/**
 * The fill runs on a trusted machine, never on a deployment.
 * Production is allowed only through the same check as the genre fill.
 */
export function catalogFillDatabaseUrl(env: ProcessEnv): string {
  if (env.VERCEL === "1" || env.VERCEL_ENV?.trim()) {
    throw new Error("The catalog fill does not run on a deployment");
  }
  return recordedGenreDatabaseUrl(env);
}

export function catalogFillPatch(
  row: CatalogFillRow,
  primary: readonly BookMatch[] | null,
  also: readonly BookMatch[] | null,
): { patch: CatalogFillPatch | null; skipped: string[] } {
  if (row.kind === "prompt") return { patch: null, skipped: [] };
  if (row.kind !== "book") throw new Error("A pick must be a book or a prompt");

  const skipped: string[] = [];
  const main = decideBook(storedBook(row), primary);
  if (main.skipped && row.title) skipped.push(row.title);

  const second = decideBook(storedAlso(row), also);
  if (second.skipped && row.alsoTitle) skipped.push(row.alsoTitle);

  const patch: CatalogFillPatch = {
    ...main.fields,
    ...alsoFields(second.fields),
  };
  return { patch: Object.keys(patch).length === 0 ? null : patch, skipped };
}

/** How many stored months gained a cover, a page count, or a lookup for a unique work. */
export async function fillEmptyCovers(
  store: CatalogFillStore,
  search: CatalogSearch,
  log: (line: string) => void = () => undefined,
): Promise<number> {
  const rows = await store.load();
  let updated = 0;
  for (const row of rows) {
    if (row.kind === "prompt") continue;
    if (row.kind !== "book") throw new Error("A pick must be a book or a prompt");

    const primary = await searched(storedBook(row), search);
    const also = await searched(storedAlso(row), search);
    const decision = catalogFillPatch(row, primary, also);
    for (const title of decision.skipped) log(`Skipped ${title}.`);
    if (!decision.patch) continue;
    await store.save(row.id, decision.patch);
    updated += 1;
  }
  return updated;
}

async function searched(book: StoredBook, search: CatalogSearch): Promise<readonly BookMatch[] | null> {
  if (!needsSearch(book) || !book.title || !book.author) return null;
  return search(book.title, book.author);
}

function decideBook(
  book: StoredBook,
  matches: readonly BookMatch[] | null,
): { fields: BookPatch | null; skipped: boolean } {
  if (!needsSearch(book)) return { fields: null, skipped: false };
  if (matches == null) return { fields: null, skipped: false };

  const work = soleWork(book, matches);
  if (work === "none" || work === "many") return { fields: null, skipped: true };
  return { fields: fieldsFromWork(book, work), skipped: false };
}

function needsSearch(book: StoredBook): boolean {
  if (!collapse(book.title ?? "") || !collapse(book.author ?? "")) return false;
  return book.coverUrl == null || book.pageCount == null;
}

/**
 * Accept a work only when one result has this title and author.
 * Anything else writes nothing. The first hit is not a match.
 */
function soleWork(book: StoredBook, matches: readonly BookMatch[]): BookMatch | "none" | "many" {
  const title = catalogIdentity(book.title ?? "");
  const author = catalogIdentity(book.author ?? "");
  const found = matches.filter((match) => {
    if (!openLibraryWorkId(match.lookupKey)) return false;
    return catalogIdentity(match.title) === title && catalogIdentity(match.author) === author;
  });
  const work = found[0];
  if (!work || found.length !== 1) return found.length === 0 ? "none" : "many";
  return work;
}

function fieldsFromWork(book: StoredBook, work: BookMatch): BookPatch | null {
  const patch: BookPatch = {};
  const cover = catalogCover(work.coverUrl);
  if (book.coverUrl == null && cover && !isWickerHusband(book.title)) patch.coverUrl = cover;

  const pageCount = catalogPageCount(work.pageCount);
  if (book.pageCount == null && pageCount != null) patch.pageCount = pageCount;

  const lookupKey = openLibraryWorkId(work.lookupKey);
  if (book.lookupKey == null && lookupKey) patch.lookupKey = lookupKey;
  if (book.lookupSource == null && lookupKey) patch.lookupSource = "open_library";

  if (patch.coverUrl == null && patch.pageCount == null && patch.lookupKey == null && patch.lookupSource == null) {
    return null;
  }
  return patch;
}

function alsoFields(fields: BookPatch | null): CatalogFillPatch {
  if (!fields) return {};
  const patch: CatalogFillPatch = {};
  if (fields.coverUrl) patch.alsoCoverUrl = fields.coverUrl;
  if (fields.pageCount != null) patch.alsoPageCount = fields.pageCount;
  if (fields.lookupKey) patch.alsoLookupKey = fields.lookupKey;
  if (fields.lookupSource) patch.alsoLookupSource = fields.lookupSource;
  return patch;
}

function storedBook(row: CatalogFillRow): StoredBook {
  return {
    title: row.title,
    author: row.author,
    coverUrl: row.coverUrl,
    pageCount: row.pageCount,
    lookupKey: row.lookupKey,
    lookupSource: row.lookupSource,
  };
}

function storedAlso(row: CatalogFillRow): StoredBook {
  return {
    title: row.alsoTitle,
    author: row.alsoAuthor,
    coverUrl: row.alsoCoverUrl,
    pageCount: row.alsoPageCount,
    lookupKey: row.alsoLookupKey,
    lookupSource: row.alsoLookupSource,
  };
}

function isWickerHusband(title: string | null): boolean {
  return catalogIdentity(title ?? "") === WICKER_HUSBAND_TITLE;
}

/** The editor's cover host, stored only as the large file the editor saves. */
function catalogCover(value: string | null): string | null {
  const url = displayCoverUrl(value);
  if (!url || url === WICKER_HUSBAND_COVER) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== OPEN_LIBRARY_COVER_HOST) return null;
  if (!LARGE_COVER.test(parsed.pathname) || parsed.search !== "" || parsed.hash !== "") return null;
  return parsed.toString();
}

function catalogPageCount(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 100_000) return null;
  return value;
}

function catalogIdentity(value: string): string {
  return collapse(value).toLocaleLowerCase("en-US");
}

function collapse(value: string): string {
  return value.replaceAll("\u0000", "").replace(/\s+/g, " ").trim();
}
