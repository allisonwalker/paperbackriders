import { desc, lte } from "drizzle-orm";
import { clubCalendarDate, clubMonthStart, clubTimeZone, formatClubMonth, isMonthStart } from "./club-date";
import { displayCoverUrl, historyCoverUrl } from "./cover";
import { CURRENT_PICK_LABEL, selectCurrentPick, type CurrentMeeting, type MeetingSettlement } from "./current-pick";
import { getDb } from "./db/client";
import { picks } from "./db/schema";
import { selectFeaturedPick } from "./featured-pick";
import { loadMeetingAnchor, rememberHappenedMeeting } from "./meeting-settlement";

export { selectFeaturedPick };

export type PickKind = "book" | "prompt";

export type PickRecord = {
  id: string;
  month: string;
  kind: PickKind;
  promptText: string | null;
  title: string | null;
  author: string | null;
  publishedYear: number | null;
  coverUrl: string | null;
  pageCount: number | null;
  genre: string | null;
  lookupSource: string | null;
  lookupKey: string | null;
  alsoRead: AlsoRead | null;
  meetingSettled?: MeetingSettlement | null;
};

export type AlsoRead = {
  title: string;
  author: string;
  publishedYear: number | null;
  coverUrl: string | null;
  pageCount: number | null;
  genre: string | null;
};

export type BookHero = {
  kind: "book";
  monthLabel: string;
  title: string | null;
  author: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  genre: string | null;
  coverUrl: string | null;
};

export type PromptHero = {
  kind: "prompt";
  monthLabel: string;
  promptText: string;
};

export type FeaturedPickState =
  | { status: "error" }
  | { status: "empty" }
  | { status: "unselected" }
  | { status: "ready"; month: string; pickLabel: string; hero: BookHero | PromptHero };

export type BookHistoryEntry = {
  kind: "book";
  month: string;
  monthLabel: string;
  title: string;
  author: string;
  pageCount: number | null;
  genre: string | null;
  coverUrl: string | null;
  marked: boolean;
  entryKey: string;
};

export type PromptHistoryEntry = {
  kind: "prompt";
  month: string;
  monthLabel: string;
  promptText: string;
  marked: boolean;
  entryKey: string;
};

export type HistoryEntry = BookHistoryEntry | PromptHistoryEntry;

export type HistoryState = { status: "error" } | { status: "ready"; entries: HistoryEntry[] };

type PickRow = typeof picks.$inferSelect;

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function logPickFailure(label: string, error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  const pickId = /Pick ([0-9a-f-]+)/i.exec(message)?.[1];
  const exposesSecret = /postgres(ql)?:\/\//i.test(message) || message.includes("DATABASE_URL");

  if (exposesSecret) {
    console.error(label, pickId ? { pickId } : "");
    return;
  }

  console.error(label, pickId ? { pickId, message } : message);
}

export function toHero(pick: PickRecord): BookHero | PromptHero {
  const monthLabel = formatClubMonth(pick.month);

  if (pick.kind === "prompt") {
    const promptText = blankToNull(pick.promptText);
    if (!promptText) {
      throw new Error(`Pick ${pick.id} is missing its prompt text`);
    }
    return { kind: "prompt", monthLabel, promptText };
  }

  return {
    kind: "book",
    monthLabel,
    title: blankToNull(pick.title),
    author: blankToNull(pick.author),
    publishedYear: pick.publishedYear,
    pageCount: pick.pageCount,
    genre: blankToNull(pick.genre),
    coverUrl: displayCoverUrl(pick.coverUrl),
  };
}

export function mapPickRow(row: PickRow): PickRecord {
  if (row.kind !== "book" && row.kind !== "prompt") {
    throw new Error(`Pick ${row.id} has an unknown kind`);
  }
  if (!isMonthStart(row.month)) {
    throw new Error(`Pick ${row.id} is not the first day of the month`);
  }

  return {
    id: row.id,
    month: row.month,
    kind: row.kind,
    promptText: row.promptText,
    title: row.title,
    author: row.author,
    publishedYear: row.publishedYear,
    coverUrl: row.coverUrl,
    pageCount: row.pageCount,
    genre: row.genre,
    lookupSource: row.lookupSource,
    lookupKey: row.lookupKey,
    alsoRead: alsoReadFrom(row),
    meetingSettled: row.meetingSettled === "skipped" || row.meetingSettled === "happened" ? row.meetingSettled : null,
  };
}

function alsoReadFrom(row: PickRow): AlsoRead | null {
  const title = blankToNull(row.alsoTitle);
  const author = blankToNull(row.alsoAuthor);
  if (!title || !author) return null;

  return {
    title,
    author,
    publishedYear: row.alsoPublishedYear,
    coverUrl: row.alsoCoverUrl,
    pageCount: row.alsoPageCount,
    genre: blankToNull(row.alsoGenre),
  };
}

export function toHistory(rows: readonly PickRecord[], featuredMonth: string | null): HistoryEntry[] {
  const ordered = [...rows].sort((left, right) => (left.month < right.month ? 1 : left.month > right.month ? -1 : 0));

  return ordered.flatMap((pick): HistoryEntry[] => {
    const monthLabel = formatClubMonth(pick.month);
    const marked = featuredMonth !== null && pick.month === featuredMonth;

    if (pick.kind === "prompt") {
      const promptText = blankToNull(pick.promptText);
      if (!promptText) {
        throw new Error(`Pick ${pick.id} is missing its prompt text`);
      }
      return [{ kind: "prompt", month: pick.month, monthLabel, promptText, marked, entryKey: pick.month }];
    }

    const title = blankToNull(pick.title);
    const author = blankToNull(pick.author);
    if (!title || !author) {
      throw new Error(`Pick ${pick.id} is missing its title or author`);
    }

    const main: BookHistoryEntry = {
      kind: "book",
      month: pick.month,
      monthLabel,
      title,
      author,
      pageCount: pick.pageCount,
      genre: blankToNull(pick.genre),
      coverUrl: historyCoverUrl(pick.coverUrl),
      marked,
      entryKey: pick.month,
    };
    if (!pick.alsoRead) return [main];

    const also: BookHistoryEntry = {
      kind: "book",
      month: pick.month,
      monthLabel,
      title: pick.alsoRead.title,
      author: pick.alsoRead.author,
      pageCount: pick.alsoRead.pageCount,
      genre: pick.alsoRead.genre,
      coverUrl: historyCoverUrl(pick.alsoRead.coverUrl),
      marked,
      entryKey: `${pick.month}:also`,
    };
    return [main, also];
  });
}

export async function loadAllPicks(): Promise<PickRecord[]> {
  const rows = await getDb().select().from(picks).orderBy(desc(picks.month));
  return rows.map(mapPickRow);
}

export type EditorPicksState = { status: "ready"; picks: PickRecord[] } | { status: "error" };

export async function loadEditorPicks(options?: {
  loadRows?: () => Promise<PickRecord[]>;
}): Promise<EditorPicksState> {
  try {
    const rows = await (options?.loadRows ?? loadAllPicks)();
    return { status: "ready", picks: rows };
  } catch (error) {
    logPickFailure("editor picks query failed", error);
    return { status: "error" };
  }
}

export async function loadHistory(options?: {
  markedMonth?: string | null;
  loadRows?: () => Promise<PickRecord[]>;
}): Promise<HistoryState> {
  try {
    const rows = await (options?.loadRows ?? loadAllPicks)();
    return { status: "ready", entries: toHistory(rows, options?.markedMonth ?? null) };
  } catch (error) {
    logPickFailure("reading history query failed", error);
    return { status: "error" };
  }
}

export async function loadPicksOnOrBefore(currentMonth: string): Promise<PickRecord[]> {
  const rows = await getDb()
    .select()
    .from(picks)
    .where(lte(picks.month, currentMonth))
    .orderBy(desc(picks.month));

  return rows.map(mapPickRow);
}

export async function loadFeaturedPick(options?: {
  now?: Date;
  timeZone?: string;
  loadRows?: () => Promise<PickRecord[]>;
  loadMeeting?: () => Promise<CurrentMeeting | null>;
}): Promise<FeaturedPickState> {
  try {
    const now = options?.now ?? new Date();
    const timeZone = options?.timeZone ?? clubTimeZone();
    const rows = await (options?.loadRows ?? (() => loadCatalogPicks(now, timeZone)))();
    const meeting = options?.loadMeeting
      ? await options.loadMeeting()
      : options?.loadRows
        ? null
        : await loadMeetingAnchor(now, timeZone);
    const selection = selectCurrentPick(rows, {
      today: clubCalendarDate(now, timeZone),
      calendarMonth: clubMonthStart(now, timeZone),
      meeting,
    });
    if (selection.status === "empty") return { status: "empty" };
    if (selection.status === "unselected") return { status: "unselected" };
    return {
      status: "ready",
      month: selection.pick.month,
      pickLabel: CURRENT_PICK_LABEL,
      hero: toHero(selection.pick),
    };
  } catch (error) {
    logPickFailure("featured pick query failed", error);
    return { status: "error" };
  }
}

async function loadCatalogPicks(now: Date, timeZone: string): Promise<PickRecord[]> {
  await rememberHappenedMeeting(now, timeZone);
  return loadAllPicks();
}
