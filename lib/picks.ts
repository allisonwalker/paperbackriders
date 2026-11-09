import { desc, lte } from "drizzle-orm";
import { clubMonthStart, clubPickLabel, clubTimeZone, formatClubMonth, isMonthStart } from "./club-date";
import { displayCoverUrl } from "./cover";
import { getDb } from "./db/client";
import { picks } from "./db/schema";

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
  | { status: "ready"; pickLabel: string; hero: BookHero | PromptHero };

type PickRow = typeof picks.$inferSelect;

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function logFeaturedPickFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  const pickId = /Pick ([0-9a-f-]+)/i.exec(message)?.[1];
  const exposesSecret = /postgres(ql)?:\/\//i.test(message) || message.includes("DATABASE_URL");

  if (exposesSecret) {
    console.error("featured pick query failed", pickId ? { pickId } : "");
    return;
  }

  console.error("featured pick query failed", pickId ? { pickId, message } : message);
}

export function selectFeaturedPick<T extends { month: string }>(
  rows: readonly T[],
  currentMonth: string,
): T | null {
  if (!isMonthStart(currentMonth)) {
    throw new Error("The current club month must be the first calendar day");
  }

  let featured: T | null = null;
  for (const row of rows) {
    if (!isMonthStart(row.month) || row.month > currentMonth) {
      continue;
    }
    if (featured === null || row.month > featured.month) {
      featured = row;
    }
  }

  return featured;
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
  };
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
    return { status: "ready", pickLabel: clubPickLabel(currentMonth), hero: toHero(pick) };
  } catch (error) {
    logFeaturedPickFailure(error);
    return { status: "error" };
  }
}
