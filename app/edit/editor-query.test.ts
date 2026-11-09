import { describe, expect, test } from "vitest";
import { MEETING_TAB_HREF, editorQueryFromSearch, picksTabHref, readEditorQuery } from "./editor-query";

describe("editor query", () => {
  test("reads a club month and a known notice", () => {
    expect(readEditorQuery({ month: "2026-11", saved: "1" })).toEqual({
      selectedMonth: "2026-11-01",
      notice: "saved",
      tab: "picks",
    });
    expect(readEditorQuery({ month: ["2026-03-01"], saved: "cover" }).notice).toBe("saved-without-cover");
    expect(readEditorQuery({ deleted: "1" })).toEqual({ selectedMonth: null, notice: "deleted", tab: "picks" });
    expect(readEditorQuery({ meeting: "1", month: "2026-11-01" })).toEqual({
      selectedMonth: "2026-11-01",
      notice: null,
      tab: "picks",
    });
    expect(readEditorQuery({ tab: "meeting", meeting: "1", month: "2026-11-01" })).toEqual({
      selectedMonth: "2026-11-01",
      notice: "meeting",
      tab: "meeting",
    });
    expect(readEditorQuery({ month: "2026-03-01", venue: "1" })).toEqual({
      selectedMonth: "2026-03-01",
      notice: "venue",
      tab: "picks",
    });
    expect(readEditorQuery({ month: "2026-03-01", place: "1" })).toEqual({
      selectedMonth: "2026-03-01",
      notice: null,
      tab: "picks",
    });
    expect(readEditorQuery({ tab: "meeting", month: "2026-03-01", place: "1" })).toEqual({
      selectedMonth: "2026-03-01",
      notice: "place",
      tab: "meeting",
    });
    expect(readEditorQuery({ month: "2026-03-01", place: "cleared" }).notice).toBeNull();
    expect(readEditorQuery({ tab: "meeting", place: "cleared" }).notice).toBe("place-cleared");
  });

  test("only tab=meeting leaves Picks, and a confirmation stays on its own tab", () => {
    expect(readEditorQuery({}).tab).toBe("picks");
    expect(readEditorQuery({ tab: "picks" }).tab).toBe("picks");
    expect(readEditorQuery({ tab: "Meeting" }).tab).toBe("picks");
    expect(readEditorQuery({ tab: "pins" }).tab).toBe("picks");
    expect(readEditorQuery({ tab: ["", "meeting"] }).tab).toBe("meeting");
    expect(readEditorQuery({ tab: "meeting" })).toMatchObject({ tab: "meeting", notice: null });
    expect(readEditorQuery({ tab: "meeting", saved: "1" }).notice).toBeNull();
    expect(readEditorQuery({ tab: "meeting", deleted: "1" }).notice).toBeNull();
    expect(readEditorQuery({ tab: "meeting", venue: "1" }).notice).toBeNull();
    expect(readEditorQuery({ tab: "meeting", place: "1" }).notice).toBe("place");
    expect(readEditorQuery({ tab: "meeting", place: "cleared" }).notice).toBe("place-cleared");
    expect(readEditorQuery({ tab: "picks", meeting: "1" }).notice).toBeNull();
  });

  test("tab links do not carry a confirmation", () => {
    expect(picksTabHref(null)).toBe("/edit");
    expect(picksTabHref("2026-11-01")).toBe("/edit?month=2026-11-01");
    expect(picksTabHref("2026-11-01")).not.toMatch(/tab=|saved=|deleted=|meeting=|venue=|place=/);
    expect(MEETING_TAB_HREF).toBe("/edit?tab=meeting");
    expect(MEETING_TAB_HREF).not.toMatch(/[?&](meeting|saved|deleted|venue|place)=/);
  });

  test("a back-button address reads the same tab and confirmation", () => {
    expect(readEditorQuery(editorQueryFromSearch("?tab=meeting&meeting=1&month=2026-11-01"))).toEqual({
      selectedMonth: "2026-11-01",
      notice: "meeting",
      tab: "meeting",
    });
    expect(readEditorQuery(editorQueryFromSearch("?meeting=1"))).toEqual({
      selectedMonth: null,
      notice: null,
      tab: "picks",
    });
  });

  test("ignores a UTC instant and any notice that is not one of ours", () => {
    expect(readEditorQuery({ month: "2026-11-01T00:00:00.000Z", saved: "<script>" })).toEqual({
      selectedMonth: null,
      notice: null,
      tab: "picks",
    });
    expect(readEditorQuery({ saved: "1", deleted: "1" }).notice).toBe("saved");
    expect(readEditorQuery({ saved: ["nope"], deleted: ["1"] }).notice).toBe("deleted");
    expect(readEditorQuery({ meeting: "<script>" }).notice).toBeNull();
    expect(readEditorQuery({ venue: "<script>" }).notice).toBeNull();
    expect(readEditorQuery({ place: "nope" }).notice).toBeNull();
  });
});
