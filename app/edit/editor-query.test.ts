import { describe, expect, test } from "vitest";
import { readEditorQuery } from "./editor-query";

describe("editor query", () => {
  test("reads a club month and a known notice", () => {
    expect(readEditorQuery({ month: "2026-11", saved: "1" })).toEqual({
      selectedMonth: "2026-11-01",
      notice: "saved",
    });
    expect(readEditorQuery({ month: ["2026-03-01"], saved: "cover" }).notice).toBe("saved-without-cover");
    expect(readEditorQuery({ deleted: "1" })).toEqual({ selectedMonth: null, notice: "deleted" });
    expect(readEditorQuery({ meeting: "1", month: "2026-11-01" })).toEqual({
      selectedMonth: "2026-11-01",
      notice: "meeting",
    });
    expect(readEditorQuery({ month: "2026-03-01", venue: "1" })).toEqual({
      selectedMonth: "2026-03-01",
      notice: "venue",
    });
    expect(readEditorQuery({ month: "2026-03-01", place: "1" })).toEqual({
      selectedMonth: "2026-03-01",
      notice: "place",
    });
    expect(readEditorQuery({ month: "2026-03-01", place: "cleared" }).notice).toBe("place-cleared");
  });

  test("ignores a UTC instant and any notice that is not one of ours", () => {
    expect(readEditorQuery({ month: "2026-11-01T00:00:00.000Z", saved: "<script>" })).toEqual({
      selectedMonth: null,
      notice: null,
    });
    expect(readEditorQuery({ saved: "1", deleted: "1" }).notice).toBe("saved");
    expect(readEditorQuery({ saved: ["nope"], deleted: ["1"] }).notice).toBe("deleted");
    expect(readEditorQuery({ meeting: "<script>" }).notice).toBeNull();
    expect(readEditorQuery({ venue: "<script>" }).notice).toBeNull();
    expect(readEditorQuery({ place: "nope" }).notice).toBeNull();
  });
});
