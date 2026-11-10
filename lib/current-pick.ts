import { isMonthStart } from "./club-date";

export type MeetingSettlement = "skipped" | "happened";

export type CurrentPickRow = {
  id: string;
  month: string;
  meetingSettled?: MeetingSettlement | null;
};

/** A scheduled meeting has a club calendar date. An unscheduled meeting does not. */
export type CurrentMeeting = {
  pickId: string;
  meetingDay: string | null;
};

export type CurrentPickSelection<T> =
  | { status: "empty" }
  | { status: "unselected" }
  | { status: "current"; pick: T };

export const CURRENT_PICK_LABEL = "Current pick";
export const UNSELECTED_PICK = "The next book hasn't been selected. Watch this space.";

/**
 * The current pick is the book the club is on.
 * A past club month counts as happened. So does a stored meeting whose date
 * is before today, and a pick marked happened or skipped.
 * A meeting dated today or later keeps its own pick current.
 * The next saved pick becomes current once this one is released. A further pick waits.
 * With nothing saved after the released pick, the catalog is unselected.
 */
export function selectCurrentPick<T extends CurrentPickRow>(
  rows: readonly T[],
  input: { today: string; calendarMonth: string; meeting: CurrentMeeting | null },
): CurrentPickSelection<T> {
  if (!isMonthStart(input.calendarMonth) || !isClubDay(input.today)) {
    throw new Error("The current pick needs a club day and a club month");
  }

  const ordered = [...rows].sort((left, right) => (left.month < right.month ? -1 : left.month > right.month ? 1 : 0));
  for (const row of ordered) {
    if (!isMonthStart(row.month)) {
      throw new Error("A pick month must be the first calendar day");
    }
  }
  if (ordered.length === 0) return { status: "empty" };

  const held = heldByUpcomingMeeting(ordered, input.meeting, input.today);
  if (held) return { status: "current", pick: held };

  const released = ordered.filter((row) => isReleased(row, input));
  if (released.length === 0) {
    return { status: "current", pick: ordered[0] };
  }

  const anchor = released[released.length - 1];
  const next = ordered.find((row) => row.month > anchor.month);
  if (!next) return { status: "unselected" };
  return { status: "current", pick: next };
}

/** `null` counts every saved pick. A far-past month counts none. */
export function reachThrough<T extends CurrentPickRow>(
  rows: readonly T[],
  input: { today: string; calendarMonth: string; meeting: CurrentMeeting | null },
): string | null {
  const selection = selectCurrentPick(rows, input);
  if (selection.status === "unselected") return null;
  if (selection.status === "current") return selection.pick.month;
  return "0001-01-01";
}

function heldByUpcomingMeeting<T extends CurrentPickRow>(
  rows: readonly T[],
  meeting: CurrentMeeting | null,
  today: string,
): T | null {
  if (!meeting?.meetingDay || meeting.meetingDay < today) return null;
  const pick = rows.find((row) => row.id === meeting.pickId);
  if (!pick || pick.meetingSettled === "skipped") return null;
  return pick;
}

function isReleased(row: CurrentPickRow, input: { today: string; calendarMonth: string; meeting: CurrentMeeting | null }): boolean {
  if (row.meetingSettled === "skipped" || row.meetingSettled === "happened") return true;
  if (input.meeting?.pickId === row.id && input.meeting.meetingDay && input.meeting.meetingDay < input.today) {
    return true;
  }
  return row.month < input.calendarMonth;
}

function isClubDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
