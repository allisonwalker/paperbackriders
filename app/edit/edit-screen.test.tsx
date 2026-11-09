import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { PickRecord } from "@/lib/picks";
import { MEETING_BLOCKS_DELETE } from "@/lib/pick-records";
import { EditScreen } from "./edit-screen";

function book(): PickRecord {
  return {
    id: "november",
    month: "2026-11-01",
    kind: "book",
    promptText: null,
    title: "The Left Hand of Darkness",
    author: "Ursula K. Le Guin",
    publishedYear: 1969,
    coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
    pageCount: 304,
    genre: "Science fiction",
    lookupSource: "open_library",
    lookupKey: "OL45883W",
  };
}

function prompt(): PickRecord {
  return {
    id: "march",
    month: "2026-03-01",
    kind: "prompt",
    promptText: "Read a book from the year you were born.",
    title: null,
    author: null,
    publishedYear: null,
    coverUrl: null,
    pageCount: null,
    genre: null,
    lookupSource: null,
    lookupKey: null,
  };
}

const editor = {
  records: { status: "ready" as const, picks: [book(), prompt()] },
  defaultMonth: "2026-11",
  notice: null,
  today: "2026-11-18",
  currentMonth: "2026-11-01",
  meeting: { status: "empty" as const },
  venue: { status: "ready" as const, enteredName: null, placeLabel: null },
};

describe("edit screen", () => {
  test("the signed-out state asks for an email and has no pick form", () => {
    const html = renderToStaticMarkup(<EditScreen access={{ status: "signed-out" }} />);
    expect(html).toContain("Sign in");
    expect(html).toContain("Email me a sign-in link");
    expect(html).toContain('type="email"');
    expect(html).toContain("Only the record keeper");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("Sign out");
    expect(html).not.toContain("Save month");
    expect(html).not.toContain("Save meeting");
    expect(html).not.toContain("Save venue name");
    expect(html).not.toContain("Next meeting");
    expect(html).not.toContain("Anyone with the link");
    expect(html).not.toContain('name="title"');
    expect(html).not.toContain("Find a book");
    expect(html).not.toContain("prompt");
    expect(html).toContain('href="/"');
  });

  test("a failed check does not present a signed-in editor", () => {
    const html = renderToStaticMarkup(<EditScreen access={{ status: "unavailable" }} />);
    expect(html).toContain("Sign-in could not be checked");
    expect(html).not.toContain("Signed in");
    expect(html).not.toContain("Save month");
    expect(html).not.toContain("Save meeting");
    expect(html).not.toContain("Save venue name");
    expect(html).not.toContain("Next meeting");
    expect(html).not.toContain('type="password"');
  });

  test("the signed-in editor can type a book or a prompt", () => {
    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    let html = "";
    try {
      html = renderToStaticMarkup(
        <EditScreen
          access={{ status: "signed-in", email: "keeper@example.com" }}
          {...editor}
          selectedMonth="2026-11-01"
        />,
      );
    } finally {
      console.error = original;
    }
    expect(errors.flat().join(" ")).not.toContain("same key");

    expect(html).toContain("Records");
    expect(html).toContain("keeper@example.com");
    expect(html).toContain("Sign out");
    expect(html).toContain("Month\u2019s pick");
    expect(html).toContain("Save month");
    expect(html).toContain("Delete this month");
    expect(html).toContain('value="The Left Hand of Darkness"');
    expect(html).toContain('value="Ursula K. Le Guin"');
    expect(html).toContain('value="1969"');
    expect(html).toContain('value="304"');
    expect(html).toContain('value="Science fiction"');
    expect(html).toContain("https://covers.openlibrary.org/b/id/1-L.jpg");
    expect(html).toContain("November 2026");
    expect(html).toContain("Read a book from the year you were born.");
    expect(html).toContain('value="2026-11-01"');
    expect(html).not.toContain('type="month"');
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain(MEETING_BLOCKS_DELETE);
    expect(html).toContain("Find a book");
    expect(html).toContain(">Search<");
    expect(html).not.toContain("Use this match");
    expect(html).toContain('name="lookupSource"');
    expect(html).toContain('value="open_library"');
    expect(html).toContain('value="OL45883W"');
    expect(html).toContain("Save venue name");
    expect(html).toContain('name="enteredName"');
    expect(html).toContain("Where this month met.");
    expect(html).toContain("this is not a map pin");
    const meeting = html.slice(html.indexOf("Next meeting"));
    expect(meeting).not.toContain('name="enteredName"');
    expect(meeting).not.toContain("Save venue name");
    expect(html.match(/<form/g)).toHaveLength(5);
  });

  test("a saved prompt shows the prompt and none of the book values", () => {
    const html = renderToStaticMarkup(
      <EditScreen access={{ status: "signed-in", email: "keeper@example.com" }} {...editor} selectedMonth="2026-03-01" />,
    );

    expect(html).toContain("Read a book from the year you were born.");
    expect(html).toContain("<em>Read a book from the year you were born.</em>");
    expect(html).not.toContain('value="The Left Hand of Darkness"');
    expect(html).not.toContain('value="1969"');
    expect(html).toContain("March 2026");
    expect(html).toContain("Delete this month");
    expect(html).not.toContain("Find a book");
    expect(html).not.toContain("OL45883W");
    expect(html).toContain('value="manual"');
  });

  test("an empty club offers a new month and a failed load is not an empty list", () => {
    const empty = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        records={{ status: "ready", picks: [] }}
        selectedMonth={null}
        notice={null}
        defaultMonth="2026-11"
        today="2026-11-18"
        currentMonth="2026-11-01"
        meeting={{ status: "empty" }}
        venue={null}
      />,
    );
    expect(empty).toContain("No months are saved yet.");
    expect(empty).toContain("Save a month&#x27;s pick before setting the meeting.");
    expect(empty).not.toContain('name="place"');
    expect(empty).toContain('type="month"');
    expect(empty).toContain('value="2026-11"');
    expect(empty).toContain("Save month");
    expect(empty).toContain("Find a book");
    expect(empty).toContain('value="manual"');
    expect(empty).not.toContain("OL45883W");
    expect(empty).not.toContain("Delete this month");
    expect(empty).not.toContain("Save venue name");

    const failed = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        records={{ status: "error" }}
        selectedMonth={null}
        notice="deleted"
        defaultMonth="2026-11"
        today="2026-11-18"
        currentMonth="2026-11-01"
        meeting={{ status: "empty" }}
        venue={null}
      />,
    );
    expect(failed).toContain("The saved months could not be loaded.");
    expect(failed).toContain("The meeting cannot be saved until the months load.");
    expect(failed).not.toContain('name="place"');
    expect(failed).toContain("Deleted.");
    expect(failed).not.toContain("No months are saved yet.");
  });

  test("says when a saved cover link was left off", () => {
    const html = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        records={{ status: "ready", picks: [] }}
        selectedMonth={null}
        notice="saved-without-cover"
        defaultMonth="2026-11"
        today="2026-11-18"
        currentMonth="2026-11-01"
        meeting={{ status: "empty" }}
        venue={null}
      />,
    );
    expect(html).toContain("Saved. The cover link was left off because it is not an Open Library cover.");
  });

  test("starts on the pick for the meeting's month, and a prompt is a choice", () => {
    const html = renderToStaticMarkup(
      <EditScreen access={{ status: "signed-in", email: "keeper@example.com" }} {...editor} selectedMonth={null} />,
    );
    const meeting = html.slice(html.indexOf("Next meeting"));

    expect(meeting).toContain("Anyone with the link can read this.");
    expect(meeting).toContain("at a member&#x27;s home.");
    expect(meeting).toContain('type="date"');
    expect(meeting).toContain('value="2026-11-18"');
    expect(meeting).toContain('type="time"');
    expect(meeting).toContain('value="18:30"');
    expect(meeting).toContain('name="place"');
    expect(meeting).toContain('type="text"');
    expect(meeting).toContain("<select");
    expect(meeting).toContain("November 2026 — The Left Hand of Darkness by Ursula K. Le Guin");
    expect(meeting).toContain("March 2026 — Read a book from the year you were born.");
    expect(meeting).toMatch(/<option[^>]*value="november"[^>]*selected/);
    expect(meeting).not.toMatch(/<option[^>]*value="march"[^>]*selected/);
    expect(meeting).toContain("Save meeting");
    expect(meeting).not.toMatch(/geocode|maps\.|openstreetmap|leaflet|<iframe|type="tel"|type="email"|name="phone"|name="email"/i);
  });

  test("starts on the featured pick when the meeting's month has none", () => {
    const html = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        records={{ status: "ready", picks: [book(), prompt()] }}
        selectedMonth={null}
        notice={null}
        defaultMonth="2027-01"
        today="2027-01-15"
        currentMonth="2027-01-01"
        meeting={{ status: "empty" }}
        venue={null}
      />,
    );
    const meeting = html.slice(html.indexOf("Next meeting"));

    expect(meeting).toContain('value="2027-01-15"');
    expect(meeting).toMatch(/<option[^>]*value="november"[^>]*selected/);
    expect(meeting).not.toMatch(/<option[^>]*value="march"[^>]*selected/);
  });

  test("reopens on the saved pick, including one she switched to", () => {
    const html = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-11-01"
        notice="meeting"
        meeting={{
          status: "set",
          date: "2026-11-18",
          time: "19:00",
          place: "at a member's home",
          pickId: "march",
        }}
      />,
    );
    const meeting = html.slice(html.indexOf("Next meeting"));

    expect(meeting).toContain("The next meeting is saved.");
    expect(meeting).toContain('value="19:00"');
    expect(meeting).toContain('value="at a member&#x27;s home"');
    expect(meeting).toMatch(/<option[^>]*value="march"[^>]*selected/);
    expect(meeting).toContain('name="returnMonth"');
    expect(meeting).toContain('value="2026-11-01"');
  });

  test("a failed meeting load is not an empty form", () => {
    const html = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth={null}
        meeting={{ status: "error" }}
      />,
    );

    expect(html).toContain("The meeting could not be loaded.");
    expect(html).not.toContain('name="place"');
    expect(html).not.toContain("Save meeting");
    expect(html).not.toContain("Save venue name");
  });

  test("offers the meeting place on a past month and keeps a name she already saved", () => {
    const offered = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-03-01"
        meeting={{
          status: "set",
          date: "2026-11-18",
          time: "19:00",
          place: "The Ruby",
          pickId: "november",
        }}
      />,
    );
    const picks = offered.slice(0, offered.indexOf("Next meeting"));
    const meeting = offered.slice(offered.indexOf("Next meeting"));

    expect(picks).toContain("March 2026");
    expect(picks).toContain('name="enteredName"');
    expect(picks).toContain('value="The Ruby"');
    expect(picks).toContain("The next meeting&#x27;s place is filled in.");
    expect(picks).not.toContain("Find this place");
    expect(picks).toContain('value="2026-03-01"');
    expect(meeting).not.toContain('name="enteredName"');
    expect(meeting).not.toContain("Save venue name");
    expect(meeting).not.toContain("Find this place");
    expect(meeting).toContain('name="place"');

    const saved = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-03-01"
        notice="venue"
        venue={{ status: "ready", enteredName: "Cal Anderson Park", placeLabel: null }}
        meeting={{
          status: "set",
          date: "2026-11-18",
          time: "19:00",
          place: "The Ruby",
          pickId: "november",
        }}
      />,
    );
    const savedPicks = saved.slice(0, saved.indexOf("Next meeting"));
    const savedMeeting = saved.slice(saved.indexOf("Next meeting"));

    expect(savedPicks).toContain("Venue name saved.");
    expect(savedPicks).toContain('value="Cal Anderson Park"');
    expect(savedPicks).toContain("Find this place");
    expect(savedPicks).toContain("Powered by Geoapify");
    expect(savedPicks).toContain("https://www.geoapify.com/");
    expect(savedPicks).toContain("A confirmed pin is public.");
    expect(savedPicks).not.toContain('value="The Ruby"');
    expect(savedMeeting).toContain('value="The Ruby"');
    expect(savedMeeting).not.toContain("Venue name saved.");
    expect(savedMeeting).not.toContain("Find this place");
    expect(savedMeeting).not.toContain("Powered by Geoapify");
    expect(savedMeeting).not.toContain("Confirm this place");
    expect(savedMeeting).not.toContain('name="candidate"');
  });

  test("a confirmed place stays on the selected month and off the next meeting", () => {
    const html = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-03-01"
        notice="place"
        venue={{ status: "ready", enteredName: "The Ruby", placeLabel: "The Ruby, Seattle, Washington" }}
      />,
    );
    const picks = html.slice(0, html.indexOf("Next meeting"));
    const meeting = html.slice(html.indexOf("Next meeting"));

    expect(picks).toContain("Place confirmed. Anyone with the link can see this pin.");
    expect(picks).toContain("Confirmed place: The Ruby, Seattle, Washington");
    expect(picks).toContain("Clear confirmed place");
    expect(picks).toContain("does not change the next meeting or move a pin");
    expect(picks).toContain("Choose a public bar, park, or similar.");
    expect(meeting).not.toContain("Confirmed place:");
    expect(meeting).not.toContain("Clear confirmed place");
    expect(meeting).not.toContain("Find this place");
    expect(meeting).not.toContain("Powered by Geoapify");
  });

  test("a failed venue load is not an empty name", () => {
    const html = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-11-01"
        venue={{ status: "error" }}
      />,
    );

    expect(html).toContain("The venue name could not be loaded.");
    expect(html).not.toContain('name="enteredName"');
    expect(html).toContain("Save month");
  });
});
