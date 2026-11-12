import { eq } from "drizzle-orm";
import { clubCalendarDate, clubMonthStart, clubTimeZone } from "./club-date";
import { selectCurrentPick, type CurrentMeeting, type MeetingSettlement } from "./current-pick";
import { getDb } from "./db/client";
import { meetings, picks } from "./db/schema";
import { loadMeetingAnchor, rememberHappenedMeeting } from "./meeting-settlement";
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
  startsAt: Date | null;
  place: string | null;
  updatedAt: Date;
};

export type MeetingStore = {
  findPick(id: string): Promise<MeetingPickRef | null>;
  save(draft: MeetingDraft): Promise<StoredMeeting>;
};

export type SkipPick = {
  id: string;
  month: string;
  meetingSettled: MeetingSettlement | null;
};

export type SkipStore = {
  rememberHappened(now: Date, timeZone: string): Promise<void>;
  listPicks(): Promise<SkipPick[]>;
  loadMeeting(now: Date, timeZone: string): Promise<CurrentMeeting | null>;
  markSkipped(pickId: string): Promise<void>;
  deleteMeeting(): Promise<void>;
  moveMeeting(pickId: string, updatedAt: Date): Promise<void>;
};

export type MeetingWriteOptions = {
  readSession?: () => Promise<SessionEmail | null>;
  allowlisted?: string | null;
  store?: MeetingStore;
  timeZone?: string;
};

export type SaveMeetingResult =
  | { status: "saved"; id: string; pickId: string; startsAt: Date | null; place: string | null }
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
      await rememberHappenedMeeting();
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

export async function skipCurrentMeeting(
  options?: Omit<MeetingWriteOptions, "store"> & { now?: Date; store?: SkipStore },
): Promise<{ status: "skipped" } | { status: "invalid" } | { status: "error" }> {
  await requireRecordKeeper(options?.readSession, options?.allowlisted);
  const now = options?.now ?? new Date();
  const timeZone = options?.timeZone ?? clubTimeZone();
  const store = options?.store ?? defaultSkipStore();
  try {
    await store.rememberHappened(now, timeZone);
    const [roster, meeting] = await Promise.all([store.listPicks(), store.loadMeeting(now, timeZone)]);
    const selection = selectCurrentPick(roster, {
      today: clubCalendarDate(now, timeZone),
      calendarMonth: clubMonthStart(now, timeZone),
      meeting,
    });
    if (selection.status !== "current" || selection.pick.meetingSettled === "happened") {
      return { status: "invalid" };
    }

    await store.markSkipped(selection.pick.id);
    const next = roster
      .filter((row) => row.month > selection.pick.month)
      .sort((left, right) => (left.month < right.month ? -1 : 1))[0];
    const updatedAt = new Date();
    if (!next) {
      await store.deleteMeeting();
      return { status: "skipped" };
    }

    await store.moveMeeting(next.id, updatedAt);
    return { status: "skipped" };
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) throw error;
    logMeetingWriteFailure(error);
    return { status: "error" };
  }
}

function defaultSkipStore(): SkipStore {
  return {
    async rememberHappened(now, timeZone) {
      await rememberHappenedMeeting(now, timeZone);
    },
    async listPicks() {
      const pickRows = await getDb()
        .select({ id: picks.id, month: picks.month, meetingSettled: picks.meetingSettled })
        .from(picks);
      return pickRows.map((row) => ({
        id: row.id,
        month: row.month,
        meetingSettled: asSettlement(row.meetingSettled),
      }));
    },
    async loadMeeting(now, timeZone) {
      return loadMeetingAnchor(now, timeZone);
    },
    async markSkipped(pickId) {
      await getDb().update(picks).set({ meetingSettled: "skipped" }).where(eq(picks.id, pickId));
    },
    async deleteMeeting() {
      await getDb().delete(meetings);
    },
    async moveMeeting(pickId, updatedAt) {
      await getDb()
        .insert(meetings)
        .values({ pickId, startsAt: null, place: null, updatedAt, singleton: true })
        .onConflictDoUpdate({
          target: meetings.singleton,
          set: { pickId, startsAt: null, place: null, updatedAt },
        });
    },
  };
}

function asSettlement(value: string | null): MeetingSettlement | null {
  return value === "skipped" || value === "happened" ? value : null;
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
