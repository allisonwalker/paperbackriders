import { eq } from "drizzle-orm";
import { isMonthStart } from "./club-date";
import { getDb } from "./db/client";
import { meetings, picks } from "./db/schema";
import { requireRecordKeeper, RecordKeeperRequiredError, type SessionEmail } from "./record-keeper";
import { normalizeMonth, parsePickForm, type FieldErrors, type PickDraft, type PickInput } from "./validation";

/**
 * Insert, update, and delete for a month's pick.
 * Reads stay in picks.ts so a read cannot write. Each function below calls
 * requireRecordKeeper before it touches a row.
 */

export const MEETING_BLOCKS_DELETE =
  "This month stays. The meeting still points at it. Point the meeting at another pick, or replace the meeting, before deleting it.";

export type StoredPick = {
  id: string;
  month: string;
  kind: "book" | "prompt";
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

export type PickStore = {
  findByMonth(month: string): Promise<StoredPick | null>;
  insert(draft: PickDraft): Promise<StoredPick>;
  update(id: string, draft: PickDraft): Promise<StoredPick | null>;
  deleteIfUnreferenced(id: string): Promise<"deleted" | "blocked" | "missing">;
};

export type WriteOptions = {
  readSession?: () => Promise<SessionEmail | null>;
  allowlisted?: string | null;
  store?: PickStore;
};

export type SaveResult =
  | { status: "saved"; id: string; month: string; coverDropped: boolean }
  | { status: "invalid"; errors: FieldErrors }
  | { status: "missing" }
  | { status: "error" };

export type DeleteResult =
  | { status: "deleted"; month: string }
  | { status: "blocked"; message: string }
  | { status: "missing"; message: string }
  | { status: "invalid"; message: string }
  | { status: "error"; message: string };

export async function insertPick(input: PickInput, options?: WriteOptions): Promise<SaveResult> {
  await requireRecordKeeper(options?.readSession, options?.allowlisted);
  const parsed = parsePickForm(input);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors };

  const store = storeFrom(options);
  try {
    const row = await store.insert(parsed.draft);
    return { status: "saved", id: row.id, month: row.month, coverDropped: parsed.coverDropped };
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) throw error;
    if (postgresCode(error) === "23505") return updatePick(input, options);
    logPickWriteFailure("inserting a pick failed", error);
    return { status: "error" };
  }
}

export async function updatePick(input: PickInput, options?: WriteOptions): Promise<SaveResult> {
  await requireRecordKeeper(options?.readSession, options?.allowlisted);
  const parsed = parsePickForm(input);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors };

  const store = storeFrom(options);
  let pickId: string | undefined;
  try {
    const existing = await store.findByMonth(parsed.draft.month);
    if (!existing) return { status: "missing" };
    pickId = existing.id;
    const row = await store.update(existing.id, parsed.draft);
    if (!row) return { status: "missing" };
    return { status: "saved", id: row.id, month: row.month, coverDropped: parsed.coverDropped };
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) throw error;
    logPickWriteFailure("updating a pick failed", error, pickId);
    return { status: "error" };
  }
}

export async function savePick(input: PickInput, options?: WriteOptions): Promise<SaveResult> {
  const parsed = parsePickForm(input);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors };

  await requireRecordKeeper(options?.readSession, options?.allowlisted);
  const store = storeFrom(options);
  try {
    const existing = await store.findByMonth(parsed.draft.month);
    if (existing) {
      const updated = await updatePick(input, options);
      if (updated.status !== "missing") return updated;
    }
    return insertPick(input, options);
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) throw error;
    logPickWriteFailure("saving a pick failed", error);
    return { status: "error" };
  }
}

export async function deletePick(input: { month?: unknown }, options?: WriteOptions): Promise<DeleteResult> {
  await requireRecordKeeper(options?.readSession, options?.allowlisted);
  const month = normalizeMonth(input.month);
  if (!month) return { status: "invalid", message: "Choose a saved month." };

  const store = storeFrom(options);
  let pickId: string | undefined;
  try {
    const existing = await store.findByMonth(month);
    if (!existing) return { status: "missing", message: "That month is not saved." };
    pickId = existing.id;
    const outcome = await store.deleteIfUnreferenced(existing.id);
    if (outcome === "blocked") return { status: "blocked", message: MEETING_BLOCKS_DELETE };
    if (outcome === "missing") return { status: "missing", message: "That month is not saved." };
    return { status: "deleted", month };
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) throw error;
    if (postgresCode(error) === "23503") return { status: "blocked", message: MEETING_BLOCKS_DELETE };
    logPickWriteFailure("deleting a pick failed", error, pickId);
    return { status: "error", message: "That month could not be deleted." };
  }
}

function storeFrom(options?: WriteOptions): PickStore {
  return options?.store ?? defaultStore();
}

function defaultStore(): PickStore {
  return {
    async findByMonth(month) {
      const rows = await getDb().select().from(picks).where(eq(picks.month, month)).limit(1);
      const row = rows[0];
      return row ? toStored(row) : null;
    },
    async insert(draft) {
      const rows = await getDb().insert(picks).values(rowValues(draft)).returning();
      const row = rows[0];
      if (!row) throw new Error("Insert did not return a pick");
      return toStored(row);
    },
    async update(id, draft) {
      const rows = await getDb().update(picks).set(rowValues(draft)).where(eq(picks.id, id)).returning();
      const row = rows[0];
      return row ? toStored(row) : null;
    },
    async deleteIfUnreferenced(id) {
      // Check and delete in one transaction. The foreign key still refuses a delete
      // if a meeting is pointed at this pick between the check and the write.
      try {
        return await getDb().transaction(async (tx) => {
          const pointed = await tx
            .select({ id: meetings.id })
            .from(meetings)
            .where(eq(meetings.pickId, id))
            .limit(1);
          if (pointed.length > 0) return "blocked" as const;

          const removed = await tx.delete(picks).where(eq(picks.id, id)).returning({ id: picks.id });
          return removed.length === 0 ? ("missing" as const) : ("deleted" as const);
        });
      } catch (error) {
        if (postgresCode(error) === "23503") return "blocked";
        throw error;
      }
    },
  };
}

function rowValues(draft: PickDraft) {
  return {
    month: draft.month,
    kind: draft.kind,
    promptText: draft.promptText,
    title: draft.title,
    author: draft.author,
    publishedYear: draft.publishedYear,
    coverUrl: draft.coverUrl,
    pageCount: draft.pageCount,
    genre: draft.genre,
    lookupSource: draft.lookupSource,
    lookupKey: draft.lookupKey,
    ...(draft.kind === "prompt"
      ? {
          alsoTitle: null,
          alsoAuthor: null,
          alsoPublishedYear: null,
          alsoCoverUrl: null,
          alsoPageCount: null,
          alsoGenre: null,
          alsoLookupSource: null,
          alsoLookupKey: null,
        }
      : {}),
  };
}

function toStored(row: typeof picks.$inferSelect): StoredPick {
  if ((row.kind !== "book" && row.kind !== "prompt") || !isMonthStart(row.month)) {
    throw new Error(`Pick ${row.id} is not a book or prompt month`);
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

function postgresCode(error: unknown): string | null {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && typeof current.code === "string" && /^\d{5}$/.test(current.code)) {
      return current.code;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return null;
}

function logPickWriteFailure(label: string, error: unknown, pickId?: string): void {
  const fromMessage = error instanceof Error ? /Pick ([0-9a-f-]{8,})/i.exec(error.message)?.[1] : undefined;
  console.error(label, { pickId: pickId ?? fromMessage, code: postgresCode(error) ?? undefined });
}
