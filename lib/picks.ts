import { desc, lte } from "drizzle-orm";
import { clubMonthStart, clubPickLabel, clubTimeZone, formatClubMonth, isMonthStart } from "./club-date";
import { displayCoverUrl } from "./cover";
import { getDb } from "./db/client";
import { picks } from "./db/schema";
import { selectFeaturedPick } from "./featured-pick";

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
  | { status: "ready"; month: string; pickLabel: string; hero: BookHero | PromptHero };

export type BookHistoryEntry = {
  kind: "book";
  month: string;
  monthLabel: string;
  title: string;
  author: string;
  pageCount: number | null;
  marked: boolean;
};

export type PromptHistoryEntry = {
  kind: "prompt";
  month: string;
  monthLabel: string;
  promptText: string;
  marked: boolean;
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
  };
}

export function toHistory(rows: readonly PickRecord[], featuredMonth: string | null): HistoryEntry[] {
  const ordered = [...rows].sort((left, right) => (left.month < right.month ? 1 : left.month > right.month ? -1 : 0));

  return ordered.map((pick) => {
    const monthLabel = formatClubMonth(pick.month);
    const marked = featuredMonth !== null && pick.month === featuredMonth;

    if (pick.kind === "prompt") {
      const promptText = blankToNull(pick.promptText);
      if (!promptText) {
        throw new Error(`Pick ${pick.id} is missing its prompt text`);
      }
      return { kind: "prompt", month: pick.month, monthLabel, promptText, marked };
    }

    const title = blankToNull(pick.title);
    const author = blankToNull(pick.author);
    if (!title || !author) {
      throw new Error(`Pick ${pick.id} is missing its title or author`);
    }

    return {
      kind: "book",
      month: pick.month,
      monthLabel,
      title,
      author,
      pageCount: pick.pageCount,
      marked,
    };
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
  loadRows?: (currentMonth: string) => Promise<PickRecord[]>;
}): Promise<FeaturedPickState> {
  try {
    const now = options?.now ?? new Date();
    const timeZone = options?.timeZone ?? clubTimeZone();
    const currentMonth = clubMonthStart(now, timeZone);
    const rows = await (options?.loadRows ?? loadPicksOnOrBefore)(currentMonth);
    const pick = selectFeaturedPick(rows, currentMonth);
    if (!pick) {
      return { status: "empty" };
    }
    return { status: "ready", month: pick.month, pickLabel: clubPickLabel(currentMonth), hero: toHero(pick) };
  } catch (error) {
    logPickFailure("featured pick query failed", error);
    return { status: "error" };
  }
}
