import { eq } from "drizzle-orm";
import { normalizeMonth } from "../validation";
import { getDb } from "../db/client";
import { picks, places, visits } from "../db/schema";
import { requireRecordKeeper, RecordKeeperRequiredError, type SessionEmail } from "../record-keeper";
import { verifyPlaceCandidate, type PlaceCandidateClaims } from "./candidate";

/**
 * Confirming or clearing the real place for one club month.
 * requireRecordKeeper runs inside each write. A place row is written only from a candidate the server signed.
 * Clearing place_id leaves the venue name in place and does not delete the place row.
 */

export type ConfirmedPlaceWrite = {
  label: string;
  latitude: number;
  longitude: number;
  provider: PlaceCandidateClaims["provider"];
  providerId: string;
};

export type PlaceVisitRef = {
  id: string;
  pickId: string;
  enteredName: string;
  placeId: string | null;
};

export type PlaceSelectionStore = {
  findVisit(month: string): Promise<PlaceVisitRef | null>;
  saveConfirmedPlace(visitId: string, place: ConfirmedPlaceWrite): Promise<{ placeId: string } | null>;
  clearPlace(visitId: string): Promise<boolean>;
};

export type PlaceSelectionOptions = {
  readSession?: () => Promise<SessionEmail | null>;
  allowlisted?: string | null;
  store?: PlaceSelectionStore;
  secret?: string;
  now?: () => number;
};

export type ConfirmPlaceResult =
  | { status: "saved"; month: string; placeId: string }
  | { status: "rejected" }
  | { status: "missing" }
  | { status: "error" };

export type ClearPlaceResult = { status: "cleared"; month: string } | { status: "missing" } | { status: "error" };

class VisitGoneError extends Error {
  constructor() {
    super("The visit was no longer there.");
    this.name = "VisitGoneError";
  }
}

export async function confirmPlaceSelection(
  input: { month: unknown; token: unknown },
  options?: PlaceSelectionOptions,
): Promise<ConfirmPlaceResult> {
  await requireRecordKeeper(options?.readSession, options?.allowlisted);

  const month = normalizeMonth(input.month);
  if (!month) return { status: "missing" };

  const secret = options?.secret ?? process.env.BETTER_AUTH_SECRET?.trim() ?? "";
  const now = readClock(options?.now);
  const claims = secret && now != null ? verifyPlaceCandidate(input.token, secret, now) : null;
  if (!claims) return { status: "rejected" };

  const store = options?.store ?? defaultStore();
  let pickId: string | undefined;
  try {
    const visit = await store.findVisit(month);
    if (!visit) return { status: "missing" };
    pickId = visit.pickId;
    const saved = await store.saveConfirmedPlace(visit.id, {
      label: claims.label,
      latitude: claims.latitude,
      longitude: claims.longitude,
      provider: claims.provider,
      providerId: claims.providerId,
    });
    if (!saved) return { status: "missing" };
    return { status: "saved", month, placeId: saved.placeId };
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) throw error;
    logPlaceWriteFailure("confirming a place failed", error, pickId);
    return { status: "error" };
  }
}

export async function clearPlaceSelection(
  input: { month: unknown },
  options?: PlaceSelectionOptions,
): Promise<ClearPlaceResult> {
  await requireRecordKeeper(options?.readSession, options?.allowlisted);

  const month = normalizeMonth(input.month);
  if (!month) return { status: "missing" };

  const store = options?.store ?? defaultStore();
  let pickId: string | undefined;
  try {
    const visit = await store.findVisit(month);
    if (!visit) return { status: "missing" };
    pickId = visit.pickId;
    const cleared = await store.clearPlace(visit.id);
    if (!cleared) return { status: "missing" };
    return { status: "cleared", month };
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) throw error;
    logPlaceWriteFailure("clearing a place failed", error, pickId);
    return { status: "error" };
  }
}

function defaultStore(): PlaceSelectionStore {
  return {
    async findVisit(month) {
      const rows = await getDb()
        .select({
          id: visits.id,
          pickId: visits.pickId,
          enteredName: visits.enteredName,
          placeId: visits.placeId,
        })
        .from(visits)
        .innerJoin(picks, eq(visits.pickId, picks.id))
        .where(eq(picks.month, month))
        .limit(1);
      return rows[0] ?? null;
    },
    async saveConfirmedPlace(visitId, place) {
      try {
        return await getDb().transaction(async (tx) => {
          const saved = await tx
            .insert(places)
            .values(place)
            .onConflictDoUpdate({
              target: [places.provider, places.providerId],
              set: { label: place.label, latitude: place.latitude, longitude: place.longitude },
            })
            .returning({ id: places.id });
          const placeId = saved[0]?.id;
          if (!placeId) throw new Error("Saving a place did not return a row");
          const updated = await tx
            .update(visits)
            .set({ placeId })
            .where(eq(visits.id, visitId))
            .returning({ id: visits.id });
          if (updated.length === 0) throw new VisitGoneError();
          return { placeId };
        });
      } catch (error) {
        if (error instanceof VisitGoneError) return null;
        throw error;
      }
    },
    async clearPlace(visitId) {
      const updated = await getDb()
        .update(visits)
        .set({ placeId: null })
        .where(eq(visits.id, visitId))
        .returning({ id: visits.id });
      return updated.length > 0;
    },
  };
}

function readClock(now: (() => number) | undefined): number | null {
  try {
    const value = now ? now() : Date.now();
    return Number.isSafeInteger(value) ? value : null;
  } catch {
    return null;
  }
}

function logPlaceWriteFailure(message: string, error: unknown, pickId?: string): void {
  console.error(message, { pickId, code: postgresCode(error) ?? undefined });
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
