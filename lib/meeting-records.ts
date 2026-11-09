import { eq } from "drizzle-orm";
import { clubTimeZone } from "./club-date";
import { getDb } from "./db/client";
import { meetings, picks } from "./db/schema";
import { parseMeetingInput, type MeetingDraft, type MeetingErrors, type MeetingInput } from "./meeting-input";
import { requireRecordKeeper, RecordKeeperRequiredError, type SessionEmail } from "./record-keeper";

/**
 * Replace the single next meeting.
 * Reads stay in meeting.ts. This function calls requireRecordKeeper before it
 * touches a row. A second save updates that same row. Past meetings are not stored.
 */

export type MeetingPickRef = {
  id: string;
  kind: "book" | "prompt";
};

export type StoredMeeting = {
  id: string;
  pickId: string;
  startsAt: Date;
  place: string;
  updatedAt: Date;
};

export type MeetingStore = {
  findPick(id: string): Promise<MeetingPickRef | null>;
  save(draft: MeetingDraft): Promise<StoredMeeting>;
};

export type MeetingWriteOptions = {
  readSession?: () => Promise<SessionEmail | null>;
  allowlisted?: string | null;
  store?: MeetingStore;
  timeZone?: string;
};

export type SaveMeetingResult =
  | { status: "saved"; id: string; pickId: string; startsAt: Date; place: string }
  | { status: "invalid"; errors: MeetingErrors }
  | { status: "error" };

export async function saveMeeting(input: MeetingInput, options?: MeetingWriteOptions): Promise<SaveMeetingResult> {
  await requireRecordKeeper(options?.readSession, options?.allowlisted);

  const parsed = parseMeetingInput(input, options?.timeZone ?? clubTimeZone());
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors };

  const store = options?.store ?? defaultStore();
  let pickId: string | undefined = parsed.draft.pickId;
  try {
    const pick = await store.findPick(parsed.draft.pickId);
    if (!pick) return { status: "invalid", errors: { pick: "Choose a stored pick." } };
    const meeting = await store.save(parsed.draft);
    return {
      status: "saved",
      id: meeting.id,
      pickId: meeting.pickId,
      startsAt: meeting.startsAt,
      place: meeting.place,
    };
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) throw error;
    if (postgresCode(error) === "23503") return { status: "invalid", errors: { pick: "Choose a stored pick." } };
    logMeetingWriteFailure(error, pickId);
    return { status: "error" };
  }
}

function defaultStore(): MeetingStore {
  return {
    async findPick(id) {
      const rows = await getDb().select({ id: picks.id, kind: picks.kind }).from(picks).where(eq(picks.id, id)).limit(1);
      const row = rows[0];
      if (!row) return null;
      if (row.kind !== "book" && row.kind !== "prompt") {
        throw new Error(`Pick ${row.id} is not a book or prompt month`);
      }
      return { id: row.id, kind: row.kind };
    },
    async save(draft) {
      const updatedAt = new Date();
      const rows = await getDb()
        .insert(meetings)
        .values({
          pickId: draft.pickId,
          startsAt: draft.startsAt,
          place: draft.place,
          updatedAt,
          singleton: true,
        })
        .onConflictDoUpdate({
          target: meetings.singleton,
          set: {
            pickId: draft.pickId,
            startsAt: draft.startsAt,
            place: draft.place,
            updatedAt,
          },
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error("Saving the meeting did not return a row");
      return {
        id: row.id,
        pickId: row.pickId,
        startsAt: row.startsAt,
        place: row.place,
        updatedAt: row.updatedAt,
      };
    },
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

function logMeetingWriteFailure(error: unknown, pickId?: string): void {
  const fromMessage = error instanceof Error ? /(?:Meeting|Pick) ([0-9a-f-]{8,})/i.exec(error.message)?.[1] : undefined;
  console.error("saving the meeting failed", { pickId: pickId ?? fromMessage, code: postgresCode(error) ?? undefined });
}
