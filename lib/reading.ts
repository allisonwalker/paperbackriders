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
  title?: string;
  coverUrl?: string | null;
  pageCount: number | null;
  genre: string | null;
  alsoRead?: {
    title?: string;
    coverUrl?: string | null;
    pageCount: number | null;
    genre: string | null;
  } | null;
};

export type GenreBook = {
  title: string;
  month: string;
  coverUrl: string | null;
};

export type GenreTotal = {
  label: string;
  count: number;
  books: GenreBook[];
};

export type ReadingTotals = {
  bookCount: number;
  pageTotal: number;
  genres: GenreTotal[];
};

export type ReadingState = { status: "error" } | ({ status: "ready" } & ReadingTotals);

const PAGE_COUNT_LIMIT = 100_000;

/**
 * Chart-only genres for named titles. A stored genre of Sci-Fi does not join
 * Science fiction. The only name alias is Gothic horror, applied later.
 */
const CHART_TITLE_GENRES: readonly { title: string; genre: string }[] = [
  { title: "The Wicker Husband", genre: "Romance" },
  { title: "The Prestige", genre: "Historical fiction" },
  { title: "A Thousand Ships", genre: "Historical fiction" },
  { title: "North Woods", genre: "Historical fiction" },
  { title: "Shadow of the Wind", genre: "Historical fiction" },
  { title: "Red Winter", genre: "Fantasy" },
  { title: "The Employees", genre: "Science fiction" },
  { title: "The Shining Girls", genre: "Science fiction" },
  { title: "The Husbands", genre: "Romantic comedy" },
  { title: "Lovelight Farms", genre: "Romantic comedy" },
  { title: "Greta & Valdin", genre: "Romantic comedy" },
  { title: "Lifeforms", genre: "Memoir" },
  { title: "Stiff", genre: "Nonfiction" },
  { title: "Big Friendship", genre: "Nonfiction" },
];

type ChartBook = {
  title: string;
  month: string;
  coverUrl: string | null;
  genre: string | null;
};

type GenreGroup = {
  count: number;
  spellings: Map<string, number>;
  books: GenreBook[];
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
    addChartBook(groups, {
      title: row.title ?? "",
      month: row.month,
      coverUrl: row.coverUrl ?? null,
      genre: row.genre,
    });
    if (row.alsoRead) {
      bookCount += 1;
      pageTotal += pagesToAdd(row.alsoRead.pageCount);
      addChartBook(groups, {
        title: row.alsoRead.title ?? "",
        month: row.month,
        coverUrl: row.alsoRead.coverUrl ?? null,
        genre: row.alsoRead.genre,
      });
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
      title: picks.title,
      coverUrl: picks.coverUrl,
      pageCount: picks.pageCount,
      genre: picks.genre,
      alsoTitle: picks.alsoTitle,
      alsoAuthor: picks.alsoAuthor,
      alsoCoverUrl: picks.alsoCoverUrl,
      alsoPageCount: picks.alsoPageCount,
      alsoGenre: picks.alsoGenre,
    })
    .from(picks);

  return rows.map((row) => ({
    id: row.id,
    month: row.month,
    kind: row.kind === "prompt" ? "prompt" : "book",
    meetingSettled: row.meetingSettled === "skipped" || row.meetingSettled === "happened" ? row.meetingSettled : null,
    title: row.title?.trim() ?? "",
    coverUrl: row.coverUrl,
    pageCount: row.pageCount,
    genre: row.genre,
    alsoRead: secondBook(row),
  }));
}

function secondBook(row: {
  alsoTitle: string | null;
  alsoAuthor: string | null;
  alsoCoverUrl: string | null;
  alsoPageCount: number | null;
  alsoGenre: string | null;
}): ReadingPick["alsoRead"] {
  const title = row.alsoTitle?.trim() ?? "";
  const author = row.alsoAuthor?.trim() ?? "";
  if (title.length === 0 || author.length === 0) return null;
  return {
    title,
    coverUrl: row.alsoCoverUrl,
    pageCount: row.alsoPageCount,
    genre: row.alsoGenre,
  };
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

function addChartBook(groups: Map<string, GenreGroup>, book: ChartBook): void {
  const spelling = chartGenre(book.title, book.genre);
  if (spelling == null) {
    return;
  }

  const key = spelling.toLocaleLowerCase("en-US");
  const group = groups.get(key) ?? { count: 0, spellings: new Map<string, number>(), books: [] };
  group.count += 1;
  group.spellings.set(spelling, (group.spellings.get(spelling) ?? 0) + 1);
  group.books.push({
    title: book.title.trim(),
    month: book.month,
    coverUrl: book.coverUrl,
  });
  groups.set(key, group);
}

/** Grouping for the chart. This does not change the genre stored on the pick. */
function chartGenre(title: string, genre: string | null): string | null {
  const fromTitle = genreForTitle(title);
  const spelling = fromTitle ?? genreWithoutNote(genre);
  if (spelling == null) {
    return null;
  }
  if (spelling.toLocaleLowerCase("en-US") === "gothic horror") {
    return "Horror";
  }
  return spelling;
}

function genreForTitle(title: string): string | null {
  const lower = title.trim().toLocaleLowerCase("en-US");
  if (lower.length === 0) {
    return null;
  }
  for (const entry of CHART_TITLE_GENRES) {
    const name = entry.title.toLocaleLowerCase("en-US");
    if (lower === name || lower.startsWith(`${name}:`)) {
      return entry.genre;
    }
  }
  return null;
}

function genreWithoutNote(genre: string | null): string | null {
  if (genre == null) {
    return null;
  }
  const collapsed = genre.replace(/\s*\([^)]*\)/g, " ").trim().replace(/\s+/g, " ");
  return collapsed.length === 0 ? null : collapsed;
}

function genresToShow(groups: Map<string, GenreGroup>): GenreTotal[] {
  return [...groups.values()]
    .map((group) => ({
      label: displaySpelling(group.spellings),
      count: group.count,
      books: [...group.books].sort(compareBooks),
    }))
    .sort((left, right) => right.count - left.count || compareLabels(left.label, right.label));
}

function compareBooks(left: GenreBook, right: GenreBook): number {
  if (left.month !== right.month) {
    return left.month < right.month ? 1 : -1;
  }
  return compareLabels(left.title, right.title);
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
