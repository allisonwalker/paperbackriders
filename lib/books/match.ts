import { displayCoverUrl } from "../cover";
import { openLibraryWorkId } from "../validation";

/** One Open Library work the record keeper may copy onto the form. */
export type BookMatch = {
  lookupKey: string;
  title: string;
  author: string;
  publishedYear: number | null;
  coverUrl: string | null;
  pageCount: number | null;
  genre: string | null;
};

export type BookSearchState =
  | { status: "matches"; matches: BookMatch[] }
  | { status: "empty" }
  | { status: "unavailable" }
  | { status: "skipped" }
  | { status: "forbidden" }
  | { status: "blank" }
  | { status: "too-long" };

export type AppliedBookFields = {
  title: string;
  author: string;
  publishedYear: string;
  pageCount: string;
  genre: string;
  coverUrl: string;
  lookupSource: "open_library";
  lookupKey: string;
};

export const SEARCH_QUERY_MAX = 200;

/** A prompt month is not a book search. Only an explicit book kind may call Open Library. */
export function canSearchKind(kind: unknown): boolean {
  return kind === "book";
}

/**
 * Copy one chosen match onto the form. A missing work id copies nothing.
 * A cover on any other host is left blank; the rest of the match still fills in.
 */
export function fieldsFromMatch(match: BookMatch): AppliedBookFields | null {
  const lookupKey = openLibraryWorkId(match.lookupKey);
  if (!lookupKey || match.title.trim() === "" || match.author.trim() === "") return null;

  return {
    title: match.title,
    author: match.author,
    publishedYear: match.publishedYear == null ? "" : String(match.publishedYear),
    pageCount: match.pageCount == null ? "" : String(match.pageCount),
    genre: match.genre ?? "",
    coverUrl: displayCoverUrl(match.coverUrl) ?? "",
    lookupSource: "open_library",
    lookupKey,
  };
}
