import { eq, isNotNull } from "drizzle-orm";
import { clubCalendarDate, clubMonthStart, clubTimeZone, formatClubMonth, isMonthStart } from "./club-date";
import { displayCoverUrl } from "./cover";
import { reachThrough, type CurrentMeeting, type MeetingSettlement } from "./current-pick";
import { getDb } from "./db/client";
import { picks, places, visits } from "./db/schema";
import { loadMeetingAnchor, rememberHappenedMeeting } from "./meeting-settlement";

export type VisitKind = "book" | "prompt";

/** A stored visit the pin query may see. A null place is an unresolved name and is never a pin. */
export type VisitCandidate = {
  placeId: string | null;
  label: string | null;
  latitude: number | null;
  longitude: number | null;
  month: string;
  kind: VisitKind;
  title: string | null;
  author: string | null;
  promptText: string | null;
  coverUrl: string | null;
  id?: string;
  meetingSettled?: MeetingSettlement | null;
};

export type BookPinVisit = {
  kind: "book";
  month: string;
  monthLabel: string;
  title: string;
  author: string;
  coverUrl: string | null;
};

export type PromptPinVisit = {
  kind: "prompt";
  month: string;
  monthLabel: string;
  promptText: string;
};

export type PinVisit = BookPinVisit | PromptPinVisit;

export type MeetingPin = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  visits: PinVisit[];
};

export type PinsState = { status: "error" } | { status: "ready"; pins: MeetingPin[] };

type PlaceGroup = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  visits: PinVisit[];
  months: Set<string>;
};

export function meetingPins(rows: readonly VisitCandidate[], currentMonth: string | null): MeetingPin[] {
  if (currentMonth !== null && !isMonthStart(currentMonth)) {
    throw new Error("The current club month must be the first calendar day");
  }

  const groups = new Map<string, PlaceGroup>();

  for (const row of rows) {
    if (!isMonthStart(row.month)) {
      throw new Error("A pick month must be the first calendar day");
    }
    if ((currentMonth !== null && row.month > currentMonth) || row.placeId == null) {
      continue;
    }

    const visit = toPinVisit(row);
    const group = groups.get(row.placeId) ?? startGroup(row);
    if (group.months.has(row.month)) {
      throw new Error("A place has two visits in the same club month");
    }
    group.months.add(row.month);
    group.visits.push(visit);
    groups.set(row.placeId, group);
  }

  return [...groups.values()]
    .filter((group) => group.visits.length > 0)
    .map((group) => ({
      id: group.id,
      label: group.label,
      latitude: group.latitude,
      longitude: group.longitude,
      visits: group.visits.sort((left, right) => compareMonthsDescending(left.month, right.month)),
    }))
    .sort((left, right) => compareLabels(left.label, right.label) || compareLabels(left.id, right.id));
}

export async function loadMeetingPins(options?: {
  now?: Date;
  timeZone?: string;
  loadRows?: () => Promise<VisitCandidate[]>;
  loadMeeting?: () => Promise<CurrentMeeting | null>;
}): Promise<PinsState> {
  try {
    const now = options?.now ?? new Date();
    const timeZone = options?.timeZone ?? clubTimeZone();
    const rows = await (options?.loadRows ?? (() => loadConfirmedVisitRows(now, timeZone)))();
    const meeting = options?.loadMeeting
      ? await options.loadMeeting()
      : options?.loadRows
        ? null
        : await loadMeetingAnchor(now, timeZone);
    const through = reachThrough(
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
    return { status: "ready", pins: meetingPins(rows, through) };
  } catch (error) {
    logPinFailure(error);
    return { status: "error" };
  }
}

export async function loadConfirmedVisitRows(now = new Date(), timeZone = clubTimeZone()): Promise<VisitCandidate[]> {
  await rememberHappenedMeeting(now, timeZone);
  const rows = await getDb()
    .select({
      placeId: places.id,
      label: places.label,
      latitude: places.latitude,
      longitude: places.longitude,
      month: picks.month,
      kind: picks.kind,
      title: picks.title,
      author: picks.author,
      promptText: picks.promptText,
      coverUrl: picks.coverUrl,
      id: picks.id,
      meetingSettled: picks.meetingSettled,
    })
    .from(visits)
    .innerJoin(places, eq(visits.placeId, places.id))
    .innerJoin(picks, eq(visits.pickId, picks.id))
    .where(isNotNull(visits.placeId));

  return rows.map((row) => ({
    placeId: row.placeId,
    label: row.label,
    latitude: row.latitude,
    longitude: row.longitude,
    month: row.month,
    kind: visitKind(row.kind),
    title: row.title,
    author: row.author,
    promptText: row.promptText,
    coverUrl: row.coverUrl,
    id: row.id,
    meetingSettled: row.meetingSettled === "skipped" || row.meetingSettled === "happened" ? row.meetingSettled : null,
  }));
}

function startGroup(row: VisitCandidate): PlaceGroup {
  if (row.placeId == null) {
    throw new Error("An unresolved visit is not a pin");
  }
  const label = requiredText(row.label, "A confirmed place is missing its label");
  const latitude = requiredCoordinate(row.latitude, "latitude");
  const longitude = requiredCoordinate(row.longitude, "longitude");
  return {
    id: row.placeId,
    label,
    latitude,
    longitude,
    visits: [],
    months: new Set<string>(),
  };
}

function toPinVisit(row: VisitCandidate): PinVisit {
  const monthLabel = formatClubMonth(row.month);
  if (row.kind === "prompt") {
    // No hover image until the prompt-month icon is added under public/.
    return {
      kind: "prompt",
      month: row.month,
      monthLabel,
      promptText: requiredText(row.promptText, "A prompt visit is missing its prompt text"),
    };
  }
  if (row.kind !== "book") {
    throw new Error("A pick must be a book or a prompt");
  }
  return {
    kind: "book",
    month: row.month,
    monthLabel,
    title: requiredText(row.title, "A book visit is missing its title"),
    author: requiredText(row.author, "A book visit is missing its author"),
    coverUrl: displayCoverUrl(row.coverUrl),
  };
}

function visitKind(kind: string): VisitKind {
  if (kind === "book" || kind === "prompt") {
    return kind;
  }
  throw new Error("A pick must be a book or a prompt");
}

function requiredText(value: string | null, message: string): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) {
    throw new Error(message);
  }
  return trimmed;
}

function requiredCoordinate(value: number | null, axis: "latitude" | "longitude"): number {
  const limit = axis === "latitude" ? 90 : 180;
  if (value == null || !Number.isFinite(value) || value < -limit || value > limit) {
    throw new Error(`A place ${axis} is out of range`);
  }
  return value;
}

function compareMonthsDescending(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? 1 : -1;
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

function logPinFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  const exposesSecret = /postgres(ql)?:\/\//i.test(message) || message.includes("DATABASE_URL");
  console.error("meeting pins query failed", exposesSecret ? "" : message);
}
