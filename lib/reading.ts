import { clubCalendarDate, clubMonthStart, clubTimeZone, isMonthStart } from "./club-date";
import { reachThrough, type CurrentMeeting, type MeetingSettlement } from "./current-pick";
import { getDb } from "./db/client";
import { picks } from "./db/schema";
import { loadMeetingAnchor, rememberHappenedMeeting } from "./meeting-settlement";
import type { PickKind } from "./picks";

export type ReadingPick = {
  id?: string;
  month: string;
  kind: PickKind;
  meetingSettled?: MeetingSettlement | null;
  pageCount: number | null;
  genre: string | null;
  alsoRead?: {
    pageCount: number | null;
    genre: string | null;
  } | null;
};

export type GenreTotal = {
  label: string;
  count: number;
};

export type ReadingTotals = {
  bookCount: number;
  pageTotal: number;
  genres: GenreTotal[];
};

export type ReadingState = { status: "error" } | ({ status: "ready" } & ReadingTotals);

const GENRE_CUTOFF = 5;
const PAGE_COUNT_LIMIT = 100_000;

type GenreGroup = {
  count: number;
  spellings: Map<string, number>;
};

export function readingTotals(rows: readonly ReadingPick[], currentMonth: string): ReadingTotals {
  if (!isMonthStart(currentMonth)) {
    throw new Error("The current club month must be the first calendar day");
  }

  let bookCount = 0;
  let pageTotal = 0;
  const groups = new Map<string, GenreGroup>();

  for (const row of rows) {
    if (!isMonthStart(row.month)) {
      throw new Error("A pick month must be the first calendar day");
    }
    if (row.month > currentMonth) {
      continue;
    }
    if (row.kind === "prompt") {
      continue;
    }
    if (row.kind !== "book") {
      throw new Error("A pick must be a book or a prompt");
    }

    bookCount += 1;
    pageTotal += pagesToAdd(row.pageCount);
    addGenre(groups, row.genre);
    if (row.alsoRead) {
      bookCount += 1;
      pageTotal += pagesToAdd(row.alsoRead.pageCount);
      addGenre(groups, row.alsoRead.genre);
    }
  }

  return { bookCount, pageTotal, genres: genresToShow(groups) };
}

export async function loadReadingTotals(options?: {
  now?: Date;
  timeZone?: string;
  loadRows?: () => Promise<ReadingPick[]>;
  loadMeeting?: () => Promise<CurrentMeeting | null>;
}): Promise<ReadingState> {
  try {
    const now = options?.now ?? new Date();
    const timeZone = options?.timeZone ?? clubTimeZone();
    const rows = await (options?.loadRows ?? (() => loadReadingRows(now, timeZone)))();
    const meeting = options?.loadMeeting
      ? await options.loadMeeting()
      : options?.loadRows
        ? null
        : await loadMeetingAnchor(now, timeZone);
    const boundary = reachThrough(
      rows.map((row, index) => ({
        id: row.id ?? row.month ?? String(index),
        month: row.month,
        meetingSettled: row.meetingSettled,
      })),
      {
        today: clubCalendarDate(now, timeZone),
        calendarMonth: clubMonthStart(now, timeZone),
        meeting,
      },
    );
    return { status: "ready", ...readingTotals(rows, boundary ?? "9999-12-01") };
  } catch (error) {
    logReadingFailure(error);
    return { status: "error" };
  }
}

async function loadReadingRows(now: Date, timeZone: string): Promise<ReadingPick[]> {
  await rememberHappenedMeeting(now, timeZone);
  const rows = await getDb()
    .select({
      id: picks.id,
      month: picks.month,
      kind: picks.kind,
      meetingSettled: picks.meetingSettled,
      pageCount: picks.pageCount,
      genre: picks.genre,
      alsoTitle: picks.alsoTitle,
      alsoAuthor: picks.alsoAuthor,
      alsoPageCount: picks.alsoPageCount,
      alsoGenre: picks.alsoGenre,
    })
    .from(picks);

  return rows.map((row) => ({
    id: row.id,
    month: row.month,
    kind: row.kind === "prompt" ? "prompt" : "book",
    meetingSettled: row.meetingSettled === "skipped" || row.meetingSettled === "happened" ? row.meetingSettled : null,
    pageCount: row.pageCount,
    genre: row.genre,
    alsoRead: secondBook(row),
  }));
}

function secondBook(row: {
  alsoTitle: string | null;
  alsoAuthor: string | null;
  alsoPageCount: number | null;
  alsoGenre: string | null;
}): ReadingPick["alsoRead"] {
  const title = row.alsoTitle?.trim() ?? "";
  const author = row.alsoAuthor?.trim() ?? "";
  if (title.length === 0 || author.length === 0) return null;
  return { pageCount: row.alsoPageCount, genre: row.alsoGenre };
}

function pagesToAdd(pageCount: number | null): number {
  if (pageCount == null) {
    return 0;
  }
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > PAGE_COUNT_LIMIT) {
    throw new Error("A page count must be a whole number from 1 to 100000");
  }
  return pageCount;
}

function addGenre(groups: Map<string, GenreGroup>, genre: string | null): void {
  if (genre == null) {
    return;
  }
  const spelling = genre.trim();
  if (spelling.length === 0) {
    return;
  }

  const key = spelling.toLocaleLowerCase("en-US");
  const group = groups.get(key) ?? { count: 0, spellings: new Map<string, number>() };
  group.count += 1;
  group.spellings.set(spelling, (group.spellings.get(spelling) ?? 0) + 1);
  groups.set(key, group);
}

function genresToShow(groups: Map<string, GenreGroup>): GenreTotal[] {
  const ranked = [...groups.values()]
    .map((group) => ({ label: displaySpelling(group.spellings), count: group.count }))
    .sort((left, right) => right.count - left.count || compareLabels(left.label, right.label));

  if (ranked.length < GENRE_CUTOFF) {
    return ranked;
  }

  const cutoff = ranked[GENRE_CUTOFF - 1]?.count;
  if (cutoff == null) {
    return ranked;
  }
  return ranked.filter((group) => group.count >= cutoff);
}

/** When two spellings of one genre occur equally often, the earlier one in code-point order is shown. */
function displaySpelling(spellings: Map<string, number>): string {
  let best = "";
  let bestCount = -1;

  for (const [spelling, count] of spellings) {
    if (count > bestCount || (count === bestCount && spelling < best)) {
      best = spelling;
      bestCount = count;
    }
  }

  return best;
}

function compareLabels(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function logReadingFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  const exposesSecret = /postgres(ql)?:\/\//i.test(message) || message.includes("DATABASE_URL");
  console.error("reading totals query failed", exposesSecret ? "" : message);
}
