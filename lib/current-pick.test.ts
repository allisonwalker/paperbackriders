import { describe, expect, test } from "vitest";
import { reachThrough, selectCurrentPick, type CurrentMeeting, type CurrentPickRow } from "./current-pick";

function row(id: string, month: string, meetingSettled: CurrentPickRow["meetingSettled"] = null): CurrentPickRow {
  return { id, month, meetingSettled };
}

const november = {
  today: "2026-11-10",
  calendarMonth: "2026-11-01",
  meeting: null as CurrentMeeting | null,
};

describe("current pick", () => {
  test("is empty when the club has never saved a pick", () => {
    expect(selectCurrentPick([], november)).toEqual({ status: "empty" });
  });

  test("holds the latest unreleased pick and lets a later one wait", () => {
    const rows = [row("oct", "2026-10-01"), row("nov", "2026-11-01"), row("dec", "2026-12-01")];
    expect(selectCurrentPick(rows, november)).toEqual({ status: "current", pick: rows[1] });
  });

  test("keeps November current while its meeting is still ahead, even if December is saved", () => {
    const rows = [row("nov", "2026-11-01"), row("dec", "2026-12-01")];
    const meeting = { pickId: "nov", meetingDay: "2026-11-20" };
    expect(selectCurrentPick(rows, { ...november, meeting })).toEqual({ status: "current", pick: rows[0] });
  });

  test("moves to December the day after an organized meeting, before December starts", () => {
    const rows = [row("nov", "2026-11-01"), row("dec", "2026-12-01"), row("jan", "2027-01-01")];
    const selection = selectCurrentPick(rows, {
      today: "2026-11-21",
      calendarMonth: "2026-11-01",
      meeting: { pickId: "nov", meetingDay: "2026-11-20" },
    });
    expect(selection).toEqual({ status: "current", pick: rows[1] });
  });

  test("remembers a happened meeting after the meeting row is replaced", () => {
    const rows = [row("nov", "2026-11-01", "happened"), row("dec", "2026-12-01")];
    expect(
      selectCurrentPick(rows, {
        today: "2026-11-21",
        calendarMonth: "2026-11-01",
        meeting: { pickId: "dec", meetingDay: null },
      }),
    ).toEqual({ status: "current", pick: rows[1] });
  });

  test("a skipped pick stays released and the next saved pick becomes current", () => {
    const rows = [row("nov", "2026-11-01", "skipped"), row("dec", "2026-12-01")];
    expect(selectCurrentPick(rows, november)).toEqual({ status: "current", pick: rows[1] });
  });

  test("skips a missing month and takes the next saved pick", () => {
    const rows = [row("nov", "2026-11-01", "happened"), row("jan", "2027-01-01")];
    expect(
      selectCurrentPick(rows, { today: "2026-11-21", calendarMonth: "2026-11-01", meeting: null }),
    ).toEqual({ status: "current", pick: rows[1] });
  });

  test("is unselected after the meeting when no next pick is saved", () => {
    const rows = [row("nov", "2026-11-01", "happened")];
    expect(
      selectCurrentPick(rows, { today: "2026-11-21", calendarMonth: "2026-11-01", meeting: null }),
    ).toEqual({ status: "unselected" });
  });

  test("a blank plan holds the current month and does not hand the page to a later pick", () => {
    const rows = [row("nov", "2026-11-01"), row("dec", "2026-12-01")];
    expect(selectCurrentPick(rows, november)).toEqual({ status: "current", pick: rows[0] });
  });

  test("an upcoming meeting keeps its own pick current", () => {
    const rows = [row("mar", "2026-03-01"), row("nov", "2026-11-01")];
    expect(
      selectCurrentPick(rows, {
        today: "2026-11-18",
        calendarMonth: "2026-11-01",
        meeting: { pickId: "mar", meetingDay: "2026-11-18" },
      }),
    ).toEqual({ status: "current", pick: rows[0] });
  });
});

describe("reached picks", () => {
  test("includes the current pick and earlier ones, and leaves January waiting", () => {
    const rows = [row("nov", "2026-11-01", "happened"), row("dec", "2026-12-01"), row("jan", "2027-01-01")];
    expect(
      reachThrough(rows, {
        today: "2026-11-21",
        calendarMonth: "2026-11-01",
        meeting: null,
      }),
    ).toBe("2026-12-01");
  });

  test("includes every saved pick while the catalog is unselected", () => {
    const rows = [row("nov", "2026-11-01", "happened")];
    expect(
      reachThrough(rows, { today: "2026-11-21", calendarMonth: "2026-11-01", meeting: null }),
    ).toBeNull();
  });
});
