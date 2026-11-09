import { eq } from "drizzle-orm";
import { isMonthStart } from "./club-date";
import { getDb } from "./db/client";
import { picks, visits } from "./db/schema";
import { PLACE_LIMIT } from "./meeting-copy";
import { requireRecordKeeper, RecordKeeperRequiredError, type SessionEmail } from "./record-keeper";
import { normalizeMonth } from "./validation";

/**
 * The venue name stored for one club month.
 * The public pin query stays in visits.ts and never reads this name.
 * requireRecordKeeper runs inside the save, before any write.
 * A save sets entered_name only. It does not insert a place or set place_id.
 */

export const VENUE_NAME_LIMIT = PLACE_LIMIT;

export type VenueNameErrors = {
  month?: string;
  enteredName?: string;
};

export type VenueNameInput = {
  month?: unknown;
  enteredName?: unknown;
};

export type StoredVisit = {
  id: string;
  pickId: string;
  enteredName: string;
  placeId: string | null;
};

export type VenueStore = {
  findPickByMonth(month: string): Promise<{ id: string } | null>;
  saveName(pickId: string, enteredName: string): Promise<StoredVisit>;
};

export type VenueWriteOptions = {
  readSession?: () => Promise<SessionEmail | null>;
  allowlisted?: string | null;
  store?: VenueStore;
};

export type SaveVenueResult =
  | { status: "saved"; id: string; month: string; enteredName: string }
  | { status: "invalid"; errors: VenueNameErrors }
  | { status: "missing"; message: string }
  | { status: "error" };

export type VenueNameState = { status: "ready"; enteredName: string | null } | { status: "error" };

const MISSING_MONTH = "That month is not saved.";

export async function saveVenueName(input: VenueNameInput, options?: VenueWriteOptions): Promise<SaveVenueResult> {
  await requireRecordKeeper(options?.readSession, options?.allowlisted);

  const parsed = parseVenueName(input);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors };

  const store = options?.store ?? defaultStore();
  let pickId: string | undefined;
  try {
    const pick = await store.findPickByMonth(parsed.month);
    if (!pick) return { status: "missing", message: MISSING_MONTH };
    pickId = pick.id;
    const row = await store.saveName(pick.id, parsed.enteredName);
    return { status: "saved", id: row.id, month: parsed.month, enteredName: row.enteredName };
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) throw error;
    if (postgresCode(error) === "23503") return { status: "missing", message: MISSING_MONTH };
    logVisitWriteFailure(error, pickId);
    return { status: "error" };
  }
}

export async function loadVenueName(
  month: string,
  options?: { read?: (month: string) => Promise<string | null> },
): Promise<VenueNameState> {
  try {
    if (!isMonthStart(month)) return { status: "ready", enteredName: null };
    const enteredName = await (options?.read ?? readEnteredName)(month);
    return { status: "ready", enteredName };
  } catch (error) {
    logVisitReadFailure(error, month);
    return { status: "error" };
  }
}

export function parseVenueName(
  input: VenueNameInput,
): { ok: true; month: string; enteredName: string } | { ok: false; errors: VenueNameErrors } {
  const errors: VenueNameErrors = {};
  const month = normalizeMonth(input.month);
  const enteredName = typeof input.enteredName === "string" ? input.enteredName.trim() : "";

  if (!month) errors.month = "Choose a saved month.";
  if (!enteredName) errors.enteredName = "Enter a venue name.";
  else if (enteredName.length > VENUE_NAME_LIMIT) {
    errors.enteredName = `Use ${VENUE_NAME_LIMIT} characters or fewer.`;
  }

  if (errors.month || errors.enteredName || !month) return { ok: false, errors };
  return { ok: true, month, enteredName };
}

function defaultStore(): VenueStore {
  return {
    async findPickByMonth(month) {
      const rows = await getDb().select({ id: picks.id }).from(picks).where(eq(picks.month, month)).limit(1);
      return rows[0] ?? null;
    },
    async saveName(pickId, enteredName) {
      const rows = await getDb()
        .insert(visits)
        .values({ pickId, enteredName })
        .onConflictDoUpdate({
          target: visits.pickId,
          set: { enteredName },
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error("Saving a venue name did not return a row");
      return {
        id: row.id,
        pickId: row.pickId,
        enteredName: row.enteredName,
        placeId: row.placeId,
      };
    },
  };
}

async function readEnteredName(month: string): Promise<string | null> {
  const rows = await getDb()
    .select({ enteredName: visits.enteredName })
    .from(visits)
    .innerJoin(picks, eq(visits.pickId, picks.id))
    .where(eq(picks.month, month))
    .limit(1);
  return rows[0]?.enteredName ?? null;
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

function logVisitWriteFailure(error: unknown, pickId?: string): void {
  console.error("saving a venue name failed", { pickId, code: postgresCode(error) ?? undefined });
}

function logVisitReadFailure(error: unknown, month: string): void {
  const message = error instanceof Error ? error.message : "";
  const exposesSecret = /postgres(ql)?:\/\//i.test(message) || message.includes("DATABASE_URL");
  console.error("venue name query failed", exposesSecret ? { month } : { month, code: postgresCode(error) ?? undefined });
}
