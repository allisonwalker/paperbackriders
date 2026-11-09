import { isMonthStart } from "./club-date";
import { displayCoverUrl } from "./cover";

/**
 * Book and prompt rules shared by the editor and the import.
 * A valid draft is a row the pick table's check constraint allows.
 */

export const PICK_TEXT_LIMITS = {
  title: 300,
  author: 300,
  genre: 120,
  prompt: 2000,
  cover: 500,
} as const;

export type PickField =
  | "month"
  | "kind"
  | "title"
  | "author"
  | "publishedYear"
  | "pageCount"
  | "genre"
  | "promptText"
  | "coverUrl";

export type FieldErrors = Partial<Record<PickField, string>>;

export type PickInput = {
  month?: unknown;
  kind?: unknown;
  title?: unknown;
  author?: unknown;
  publishedYear?: unknown;
  coverUrl?: unknown;
  pageCount?: unknown;
  genre?: unknown;
  promptText?: unknown;
};

export type BookDraft = {
  kind: "book";
  month: string;
  title: string;
  author: string;
  publishedYear: number | null;
  coverUrl: string | null;
  pageCount: number | null;
  genre: string | null;
  promptText: null;
  lookupSource: "manual";
  lookupKey: null;
};

export type PromptDraft = {
  kind: "prompt";
  month: string;
  promptText: string;
  title: null;
  author: null;
  publishedYear: null;
  coverUrl: null;
  pageCount: null;
  genre: null;
  lookupSource: null;
  lookupKey: null;
};

export type PickDraft = BookDraft | PromptDraft;

export type ParseResult =
  | { ok: true; draft: PickDraft; coverDropped: boolean }
  | { ok: false; errors: FieldErrors };

const FORM_FIELDS = [
  "month",
  "kind",
  "title",
  "author",
  "publishedYear",
  "coverUrl",
  "pageCount",
  "genre",
  "promptText",
] as const satisfies readonly (keyof PickInput)[];

export function pickInputFromForm(formData: FormData): PickInput {
  const input: PickInput = {};
  for (const name of FORM_FIELDS) {
    const value = formData.get(name);
    input[name] = typeof value === "string" ? value : "";
  }
  return input;
}

/** A club month is stored as the first calendar day. Instants are rejected so UTC cannot shift the month. */
export function normalizeMonth(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] === undefined ? 1 : Number(match[3]);
  if (!isRealCalendarDay(year, month, day)) return null;

  const stored = `${match[1]}-${match[2]}-01`;
  return isMonthStart(stored) ? stored : null;
}

export function monthInputValue(month: string): string {
  const normalized = normalizeMonth(month);
  if (!normalized) {
    throw new Error("A pick month must be the first calendar day of that month");
  }
  return normalized.slice(0, 7);
}

export function parsePickForm(input: PickInput): ParseResult {
  const errors: FieldErrors = {};
  const month = normalizeMonth(input.month);
  if (!month) errors.month = "Choose a month.";

  const kind = normalizeKind(input.kind);
  if (!kind) errors.kind = "Choose a book or a prompt.";
  if (!kind) return { ok: false, errors };

  if (kind === "prompt") {
    const promptText = requiredPrompt(input.promptText);
    if (!promptText.ok) errors.promptText = promptText.error;
    if (!month || !promptText.ok) return { ok: false, errors };

    return {
      ok: true,
      coverDropped: false,
      draft: {
        kind: "prompt",
        month,
        promptText: promptText.value,
        title: null,
        author: null,
        publishedYear: null,
        coverUrl: null,
        pageCount: null,
        genre: null,
        lookupSource: null,
        lookupKey: null,
      },
    };
  }

  const title = requiredLine(input.title, PICK_TEXT_LIMITS.title, "Enter a title.", "The title is too long.");
  const author = requiredLine(input.author, PICK_TEXT_LIMITS.author, "Enter an author.", "The author is too long.");
  const publishedYear = optionalWholeNumber(
    input.publishedYear,
    1,
    9999,
    "Enter a publication year as a whole number.",
  );
  const pageCount = optionalWholeNumber(input.pageCount, 1, 100_000, "Enter the page count as a whole number.");
  const genre = optionalLine(input.genre, PICK_TEXT_LIMITS.genre, "The genre is too long.");
  const cover = optionalCover(input.coverUrl);

  if (!title.ok) errors.title = title.error;
  if (!author.ok) errors.author = author.error;
  if (!publishedYear.ok) errors.publishedYear = publishedYear.error;
  if (!pageCount.ok) errors.pageCount = pageCount.error;
  if (!genre.ok) errors.genre = genre.error;
  if (!cover.ok) errors.coverUrl = cover.error;

  if (!month || !title.ok || !author.ok || !publishedYear.ok || !pageCount.ok || !genre.ok || !cover.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    coverDropped: cover.dropped,
    draft: {
      kind: "book",
      month,
      title: title.value,
      author: author.value,
      publishedYear: publishedYear.value,
      coverUrl: cover.url,
      pageCount: pageCount.value,
      genre: genre.value,
      promptText: null,
      lookupSource: "manual",
      lookupKey: null,
    },
  };
}

function normalizeKind(value: unknown): "book" | "prompt" | null {
  if (typeof value !== "string") return null;
  const kind = value.trim();
  if (kind === "book" || kind === "prompt") return kind;
  return null;
}

type TextOk = { ok: true; value: string };
type TextFail = { ok: false; error: string };

function requiredLine(value: unknown, max: number, emptyError: string, longError: string): TextOk | TextFail {
  const text = readLine(value, max, longError);
  if (!text.ok) return text;
  if (!text.value) return { ok: false, error: emptyError };
  return { ok: true, value: text.value };
}

function optionalLine(value: unknown, max: number, longError: string): { ok: true; value: string | null } | TextFail {
  const text = readLine(value, max, longError);
  if (!text.ok) return text;
  return { ok: true, value: text.value || null };
}

function requiredPrompt(value: unknown): TextOk | TextFail {
  if (typeof value !== "string") return { ok: false, error: "Enter the prompt." };
  if (value.length > PICK_TEXT_LIMITS.prompt + 1000) return { ok: false, error: "The prompt is too long." };

  const cleaned = value.replaceAll("\u0000", "").replaceAll("\r\n", "\n").trim();
  if (!cleaned) return { ok: false, error: "Enter the prompt." };
  if (cleaned.length > PICK_TEXT_LIMITS.prompt) return { ok: false, error: "The prompt is too long." };
  return { ok: true, value: cleaned };
}

function readLine(value: unknown, max: number, longError: string): { ok: true; value: string } | TextFail {
  if (value == null) return { ok: true, value: "" };
  if (typeof value !== "string") return { ok: false, error: longError };
  if (value.length > max + 1000) return { ok: false, error: longError };

  const cleaned = value.replaceAll(/[\u0000\r\n\t]+/g, " ").replaceAll(/ {2,}/g, " ").trim();
  if (cleaned.length > max) return { ok: false, error: longError };
  return { ok: true, value: cleaned };
}

function optionalWholeNumber(
  value: unknown,
  min: number,
  max: number,
  error: string,
): { ok: true; value: number | null } | TextFail {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string" && typeof value !== "number") return { ok: false, error };
  const text = String(value).trim();
  if (!text) return { ok: true, value: null };
  if (!/^(0|[1-9]\d*)$/.test(text)) return { ok: false, error };

  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return { ok: false, error };
  return { ok: true, value: parsed };
}

function optionalCover(
  value: unknown,
): { ok: true; url: string | null; dropped: boolean } | TextFail {
  if (value == null) return { ok: true, url: null, dropped: false };
  if (typeof value !== "string") return { ok: false, error: "Enter a cover link." };

  const trimmed = value.trim();
  if (!trimmed) return { ok: true, url: null, dropped: false };
  if (trimmed.length > PICK_TEXT_LIMITS.cover) return { ok: false, error: "That cover link is too long." };

  const url = displayCoverUrl(trimmed);
  if (!url) return { ok: true, url: null, dropped: true };
  return { ok: true, url, dropped: false };
}

function isRealCalendarDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}
