import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { loadMeetingPins, meetingPins, type VisitCandidate } from "./visits";

const currentMonth = "2026-11-01";
const november = new Date("2026-11-08T20:00:00.000Z");
const ruby = "11111111-1111-4111-8111-111111111111";
const park = "22222222-2222-4222-8222-222222222222";
const cover = "https://covers.openlibrary.org/b/id/42-L.jpg";

function visit(overrides: Partial<VisitCandidate> = {}): VisitCandidate {
  return {
    placeId: ruby,
    label: "The Ruby",
    latitude: 47.61,
    longitude: -122.33,
    month: "2026-10-01",
    kind: "book",
    title: "The Left Hand of Darkness",
    author: "Ursula K. Le Guin",
    promptText: null,
    coverUrl: cover,
    ...overrides,
  };
}

describe("meeting pins", () => {
  test("keeps confirmed visits from this month and earlier, one pin per place", () => {
    const pins = meetingPins(
      [
        visit({ month: "2026-09-01", title: "Kindred", author: "Octavia Butler", coverUrl: cover }),
        visit({ month: "2026-11-01", title: "Piranesi", author: "Susanna Clarke" }),
        visit({
          placeId: park,
          label: "Cal Anderson Park",
          latitude: 47.62,
          longitude: -122.32,
          month: "2026-08-01",
          title: "Circe",
          author: "Madeline Miller",
        }),
        visit({
          placeId: ruby,
          label: "The Ruby",
          month: "2026-12-01",
          title: "Future Book",
          author: "Not Yet",
        }),
      ],
      currentMonth,
    );

    expect(pins.map((pin) => pin.label)).toEqual(["Cal Anderson Park", "The Ruby"]);
    const rubyPin = pins.find((pin) => pin.id === ruby);
    expect(rubyPin?.visits.map((item) => item.month)).toEqual(["2026-11-01", "2026-09-01"]);
    expect(rubyPin?.latitude).toBe(47.61);
    expect(rubyPin?.longitude).toBe(-122.33);
    expect(JSON.stringify(pins)).not.toContain("Future Book");
    expect(JSON.stringify(pins)).not.toContain("entered");
  });

  test("drops a future place, an unresolved name, and a place with no included visits", () => {
    const pins = meetingPins(
      [
        visit({
          placeId: null,
          label: "Typed Bar",
          latitude: null,
          longitude: null,
          month: "2026-10-01",
          title: "Hidden",
          author: "Nobody",
        }),
        visit({
          placeId: park,
          label: "Next Month Park",
          month: "2027-01-01",
          title: "Later",
          author: "Later",
        }),
      ],
      currentMonth,
    );

    expect(pins).toEqual([]);
    expect(JSON.stringify(pins)).not.toContain("Typed Bar");
    expect(JSON.stringify(pins)).not.toContain("Next Month Park");
  });

  test("lists a book with its month and only an Open Library cover, and a prompt with no image", () => {
    const pins = meetingPins(
      [
        visit({
          month: "2026-11-01",
          title: "Piranesi",
          author: "Susanna Clarke",
          coverUrl: "https://example.com/cover.jpg",
        }),
        visit({
          month: "2026-10-01",
          kind: "prompt",
          title: null,
          author: null,
          promptText: "A book you loved at twelve",
          coverUrl: cover,
        }),
      ],
      currentMonth,
    );

    expect(pins).toHaveLength(1);
    expect(pins[0]?.visits).toEqual([
      {
        kind: "book",
        month: "2026-11-01",
        monthLabel: "November 2026",
        title: "Piranesi",
        author: "Susanna Clarke",
        coverUrl: null,
      },
      {
        kind: "prompt",
        month: "2026-10-01",
        monthLabel: "October 2026",
        promptText: "A book you loved at twelve",
      },
    ]);
    expect(pins[0]?.visits[1]).not.toHaveProperty("coverUrl");
  });

  test("keeps a real Open Library cover", () => {
    const pins = meetingPins([visit()], currentMonth);
    const book = pins[0]?.visits[0];
    expect(book?.kind).toBe("book");
    if (book?.kind === "book") {
      expect(book.coverUrl).toBe(cover);
    }
  });
});

describe("load meeting pins", () => {
  test("returns an error instead of an empty map when the query fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pins = await loadMeetingPins({
      now: november,
      loadRows: () => Promise.reject(new Error("connection refused")),
    });

    expect(pins).toEqual({ status: "error" });
    expect(error).toHaveBeenCalledWith("meeting pins query failed", "connection refused");
    error.mockRestore();
  });

  test("does not log a database url", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await loadMeetingPins({
      now: november,
      loadRows: () => Promise.reject(new Error("postgres://user:secret@localhost/db")),
    });

    expect(error).toHaveBeenCalledWith("meeting pins query failed", "");
    error.mockRestore();
  });

  test("pins a current pick whose month has not started", async () => {
    const pins = await loadMeetingPins({
      now: november,
      loadRows: async () => [visit({ month: "2026-12-01", title: "Not yet", author: "Not yet" })],
    });

    expect(pins.status).toBe("ready");
    if (pins.status === "ready") {
      expect(pins.pins).toHaveLength(1);
      expect(pins.pins[0]?.visits[0]).toMatchObject({ title: "Not yet", month: "2026-12-01" });
    }
  });

  test("the query joins confirmed places only and does not select the typed name or call a geocoder", () => {
    const source = readFileSync(new URL("./visits.ts", import.meta.url), "utf8");

    expect(source).toContain("innerJoin");
    expect(source).toContain("isNotNull(visits.placeId)");
    expect(source).toContain("reachThrough");
    expect(source).not.toMatch(/enteredName|entered_name/);
    expect(source).not.toMatch(/geoapify|GEOAPIFY|nominatim|googleapis/i);
    expect(source).not.toMatch(/openfreemap/i);
  });
});
