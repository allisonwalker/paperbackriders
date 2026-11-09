import { OPEN_LIBRARY_COVER_HOST } from "../cover";
import { requireRecordKeeper, RecordKeeperRequiredError, type SessionEmail } from "../record-keeper";
import { PICK_TEXT_LIMITS, openLibraryWorkId } from "../validation";
import { SEARCH_QUERY_MAX, canSearchKind, type BookMatch, type BookSearchState } from "./match";

/**
 * Open Library search for the signed-in record keeper.
 * The request URL is built here. A query string never becomes the host.
 */

export const OPEN_LIBRARY_SEARCH_ORIGIN = "https://openlibrary.org";
export const OPEN_LIBRARY_SEARCH_PATH = "/search.json";
const SEARCH_LIMIT = 5;
const DOCS_SCAN_LIMIT = 20;
const MAX_BODY_BYTES = 512_000;
const SEARCH_TIMEOUT_MS = 8_000;
const SEARCH_FIELDS = "key,title,author_name,first_publish_year,cover_i,number_of_pages_median,subject";

const WORK_PATH = /^\/works\/(OL[1-9]\d{0,11}W)$/;

export type SearchDeps = {
  readSession?: () => Promise<SessionEmail | null>;
  allowlisted?: string | null;
  fetch?: typeof fetch;
};

export function isOpenLibrarySearchUrl(url: URL): boolean {
  return (
    url.origin === OPEN_LIBRARY_SEARCH_ORIGIN &&
    url.pathname === OPEN_LIBRARY_SEARCH_PATH &&
    url.username === "" &&
    url.password === ""
  );
}

export async function searchBooksForRecordKeeper(
  input: { query: unknown; kind: unknown },
  options?: SearchDeps,
): Promise<BookSearchState> {
  if (!canSearchKind(input.kind)) return { status: "skipped" };

  try {
    await requireRecordKeeper(options?.readSession, options?.allowlisted);
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) return { status: "forbidden" };
    logSearchFailure();
    return { status: "unavailable" };
  }

  const query = normalizeSearchQuery(input.query);
  if (!query.ok) return { status: query.reason === "too-long" ? "too-long" : "blank" };

  return searchOpenLibrary(query.query, options?.fetch ?? fetch);
}

async function searchOpenLibrary(query: string, fetchImpl: typeof fetch): Promise<BookSearchState> {
  const requested = buildSearchUrl(query);
  if (!requested || !isOpenLibrarySearchUrl(requested)) {
    logSearchFailure();
    return { status: "unavailable" };
  }

  let response: Response;
  try {
    response = await fetchImpl(requested.toString(), {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch {
    logSearchFailure();
    return { status: "unavailable" };
  }

  if (!stayedOnSearchHost(response, requested) || response.status !== 200) {
    logSearchFailure(response.status);
    await discardBody(response);
    return { status: "unavailable" };
  }

  const body = await readLimitedText(response);
  if (body == null) {
    logSearchFailure(response.status);
    return { status: "unavailable" };
  }

  try {
    return matchesFromPayload(JSON.parse(body));
  } catch {
    logSearchFailure(response.status);
    return { status: "unavailable" };
  }
}

function buildSearchUrl(query: string): URL | null {
  const url = new URL(OPEN_LIBRARY_SEARCH_PATH, OPEN_LIBRARY_SEARCH_ORIGIN);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(SEARCH_LIMIT));
  url.searchParams.set("fields", SEARCH_FIELDS);
  return isOpenLibrarySearchUrl(url) ? url : null;
}

function stayedOnSearchHost(response: Response, requested: URL): boolean {
  if (response.status >= 300 && response.status < 400) return false;
  if (response.url === "") return true;
  try {
    return isOpenLibrarySearchUrl(new URL(response.url));
  } catch {
    return isOpenLibrarySearchUrl(requested);
  }
}

function matchesFromPayload(payload: unknown): BookSearchState {
  if (payload == null || typeof payload !== "object" || !("docs" in payload) || !Array.isArray(payload.docs)) {
    logSearchFailure(200);
    return { status: "unavailable" };
  }

  const matches: BookMatch[] = [];
  const seen = new Set<string>();
  for (const doc of payload.docs.slice(0, DOCS_SCAN_LIMIT)) {
    const match = matchFromDoc(doc);
    if (!match || seen.has(match.lookupKey)) continue;
    seen.add(match.lookupKey);
    matches.push(match);
    if (matches.length === SEARCH_LIMIT) break;
  }

  return matches.length === 0 ? { status: "empty" } : { status: "matches", matches };
}

function matchFromDoc(doc: unknown): BookMatch | null {
  if (doc == null || typeof doc !== "object") return null;

  const record = doc as Record<string, unknown>;
  const lookupKey = workId(record.key);
  const title = fitLine(record.title, PICK_TEXT_LIMITS.title);
  const author = authors(record.author_name);
  if (!lookupKey || !title || !author) return null;

  return {
    lookupKey,
    title,
    author,
    publishedYear: wholeNumber(record.first_publish_year, 1, 9999),
    coverUrl: coverUrl(record.cover_i),
    pageCount: wholeNumber(record.number_of_pages_median, 1, 100_000),
    genre: oneSubject(record.subject),
  };
}

function workId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = WORK_PATH.exec(value)?.[1];
  return id ? openLibraryWorkId(id) : null;
}

function authors(value: unknown): string | null {
  if (!Array.isArray(value)) return null;

  let joined = "";
  for (const item of value.slice(0, 8)) {
    if (typeof item !== "string") continue;
    const name = fitLine(item, PICK_TEXT_LIMITS.author);
    if (!name) continue;
    const next = joined ? `${joined}, ${name}` : name;
    if (next.length > PICK_TEXT_LIMITS.author) break;
    joined = next;
  }

  return joined || null;
}

function oneSubject(value: unknown): string | null {
  if (!Array.isArray(value)) return null;

  for (const item of value.slice(0, 30)) {
    if (typeof item !== "string") continue;
    const subject = fitLine(item, PICK_TEXT_LIMITS.genre);
    if (!subject || subject.includes("://") || subject.includes("\\") || subject.startsWith("//")) continue;
    return subject;
  }

  return null;
}

function coverUrl(coverId: unknown): string | null {
  if (typeof coverId !== "number" || !Number.isSafeInteger(coverId) || coverId < 1 || coverId > 999_999_999) {
    return null;
  }

  const url = new URL(`/b/id/${coverId}-L.jpg`, `https://${OPEN_LIBRARY_COVER_HOST}`);
  if (url.origin !== `https://${OPEN_LIBRARY_COVER_HOST}` || url.pathname !== `/b/id/${coverId}-L.jpg`) {
    return null;
  }
  return url.toString();
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) return null;
  return value;
}

function fitLine(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replaceAll(/[\u0000\r\n\t]+/g, " ").replaceAll(/ {2,}/g, " ").trim();
  if (!cleaned || cleaned.length > max) return null;
  return cleaned;
}

function normalizeSearchQuery(value: unknown): { ok: true; query: string } | { ok: false; reason: "blank" | "too-long" } {
  if (typeof value !== "string") return { ok: false, reason: "blank" };
  const cleaned = value.replaceAll("\u0000", "").replace(/\s+/g, " ").trim();
  if (!cleaned) return { ok: false, reason: "blank" };
  if (cleaned.length > SEARCH_QUERY_MAX) return { ok: false, reason: "too-long" };
  return { ok: true, query: cleaned };
}

async function readLimitedText(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return text.length > MAX_BODY_BYTES ? null : text;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The failure is already reported. Dropping the unread body is best-effort.
  }
}

function logSearchFailure(status?: number): void {
  const safeStatus = typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
  console.error("Open Library search failed", safeStatus === undefined ? "" : { status: safeStatus });
}
