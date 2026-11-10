import { readFileSync } from "node:fs";
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
    expect(html).not.toContain("Find this place");
    expect(html).not.toContain("Powered by Geoapify");
    expect(html).not.toContain("prompt");
    expect(html).toContain('href="/"');
    expect(html).toContain("Paperback");
    expect(html).not.toContain('href="/analytics"');
    expect(html).not.toContain(">Catalog</a>");
    expect(html).not.toContain(">Analytics</a>");
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
    expect(html).toContain(">Picks<");
    expect(html).toMatch(/<a(?=[^>]*href="\/edit\?month=2026-11-01")(?=[^>]*aria-current="page")[^>]*>/);
    expect(html).toMatch(/href="\/edit\?tab=meeting"/);
    expect(html).not.toMatch(/href="\/edit\?tab=meeting&/);
    expect(html).not.toContain("Save meeting");
    expect(html).not.toContain('name="place"');
    expect(html).not.toContain("Find this place");
    expect(html.match(/<form/g)).toHaveLength(4);
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
    expect(empty).not.toContain("Save a month&#x27;s pick before setting the meeting.");
    expect(empty).not.toContain("Save meeting");
    expect(empty).not.toContain('name="place"');
    expect(empty).toContain('type="month"');
    expect(empty).toContain('value="2026-11"');
    expect(empty).toContain("Save month");
    expect(empty).toContain("Find a book");
    expect(empty).toContain('value="manual"');
    expect(empty).not.toContain("OL45883W");
    expect(empty).not.toContain("Delete this month");
    expect(empty).not.toContain("Save venue name");

    const emptyMeeting = renderToStaticMarkup(
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
        tab="meeting"
      />,
    );
    expect(emptyMeeting).toContain("Save a month&#x27;s pick before setting the meeting.");
    expect(emptyMeeting).not.toContain("Save meeting");
    expect(emptyMeeting).not.toContain("Save month");
    expect(emptyMeeting).not.toContain('name="place"');
    expect(emptyMeeting).not.toContain("No months are saved yet.");

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
    expect(failed).not.toContain("The meeting cannot be saved until the months load.");
    expect(failed).not.toContain('name="place"');
    expect(failed).toContain("Deleted.");
    expect(failed).not.toContain("No months are saved yet.");

    const failedMeeting = renderToStaticMarkup(
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
        tab="meeting"
      />,
    );
    expect(failedMeeting).toContain("The meeting cannot be saved until the months load.");
    expect(failedMeeting).not.toContain("Save meeting");
    expect(failedMeeting).not.toContain('name="place"');
    expect(failedMeeting).not.toContain("Deleted.");
    expect(failedMeeting).not.toContain("The saved months could not be loaded.");
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

  test("names the current pick and can leave the date unset", () => {
    const html = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth={null}
        tab="meeting"
      />,
    );
    const meeting = html;

    expect(meeting).toContain("Anyone with the link can read this.");
    expect(meeting).toContain("at a member&#x27;s home.");
    expect(meeting).toContain('type="date"');
    expect(meeting).toContain('value="2026-11-18"');
    expect(meeting).toContain('type="time"');
    expect(meeting).toContain('value="18:30"');
    expect(meeting).toContain('name="place"');
    expect(meeting).toContain('type="text"');
    expect(meeting).not.toContain("<select");
    expect(meeting).toContain("November 2026 — The Left Hand of Darkness by Ursula K. Le Guin");
    expect(meeting).toContain("Date and place aren&#x27;t set yet");
    expect(meeting).toContain("Skip this meeting");
    expect(meeting).toContain("Save meeting");
    expect(meeting.indexOf('id="meeting-pick"')).toBeLessThan(meeting.indexOf('id="meeting-date"'));
    expect(meeting.indexOf('id="meeting-date"')).toBeLessThan(meeting.indexOf('id="meeting-time"'));
    expect(meeting.indexOf('id="meeting-time"')).toBeLessThan(meeting.indexOf('id="meeting-place"'));
    expect(meeting.indexOf('id="meeting-place"')).toBeLessThan(meeting.indexOf("Save meeting"));
    expect(meeting).not.toContain("Find this place");
    expect(meeting).not.toContain("Confirm this place");
    expect(meeting).not.toContain("Clear confirmed place");
    expect(meeting).not.toContain("Powered by Geoapify");
    expect(meeting).not.toContain('name="query"');
    expect(meeting).not.toContain('name="candidate"');
    expect(meeting).not.toContain("Save venue name");
    expect(meeting).not.toContain("Save month");
    expect(meeting).not.toMatch(/geocode|leaflet|<iframe|type="tel"|type="email"|name="phone"|name="email"/i);
  });

  test("asks for the next pick when every saved pick has been released", () => {
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
        tab="meeting"
      />,
    );
    const meeting = html;

    expect(meeting).toContain("The next book hasn&#x27;t been selected. Watch this space.");
  });

  test("reopens on the saved pick, including one she switched to", () => {
    const html = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-11-01"
        notice="meeting"
        tab="meeting"
        meeting={{
          status: "set",
          date: "2026-11-18",
          time: "19:00",
          place: "at a member's home",
          pickId: "march",
        }}
      />,
    );
    const meeting = html;

    expect(meeting).toContain("The next meeting is saved.");
    expect(meeting).toContain('value="19:00"');
    expect(meeting).toContain('value="at a member&#x27;s home"');
    expect(meeting).toContain("March 2026 — Read a book from the year you were born.");
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
        tab="meeting"
      />,
    );

    expect(html).toContain("The meeting could not be loaded.");
    expect(html).not.toContain('name="place"');
    expect(html).not.toContain("Save meeting");
    expect(html).not.toContain("Save venue name");
  });

  test("offers the meeting place on a past month and keeps a name she already saved", () => {
    const meetingRow = {
      status: "set" as const,
      date: "2026-11-18",
      time: "19:00",
      place: "The Ruby",
      pickId: "november",
    };
    const offered = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-03-01"
        meeting={meetingRow}
      />,
    );
    expect(offered).toContain("March 2026");
    expect(offered).toContain('name="enteredName"');
    expect(offered).toContain('value="The Ruby"');
    expect(offered).toContain("The next meeting&#x27;s place is filled in.");
    expect(offered).not.toContain("Find this place");
    expect(offered).not.toContain("Powered by Geoapify");
    expect(offered).toContain('value="2026-03-01"');
    expect(offered).not.toContain("Save meeting");
    expect(offered).not.toContain('name="place"');
    const offeredMeeting = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-03-01"
        meeting={meetingRow}
        tab="meeting"
      />,
    );
    expect(offeredMeeting).toContain('name="place"');
    expect(offeredMeeting).toContain('value="The Ruby"');
    expect(offeredMeeting).toContain("Anyone with the link can read this.");
    expect(offeredMeeting).not.toContain("Find this place");
    expect(offeredMeeting).not.toContain("Powered by Geoapify");
    expect(offeredMeeting).not.toContain('name="query"');
    expect(offeredMeeting).not.toContain('name="enteredName"');
    expect(offeredMeeting).not.toContain("Save venue name");

    const saved = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-03-01"
        notice="venue"
        venue={{ status: "ready", enteredName: "Cal Anderson Park", placeLabel: null }}
        meeting={meetingRow}
      />,
    );
    expect(saved).toContain("Venue name saved.");
    expect(saved).toContain('value="Cal Anderson Park"');
    expect(saved.indexOf('id="venue-name"')).toBeLessThan(saved.indexOf("Find this place"));
    expect(saved).toContain("Find this place");
    expect(saved).toContain("No place is confirmed for this month.");
    expect(saved).toContain("A confirmed pin is public.");
    expect(saved).toContain("Powered by Geoapify");
    expect(saved).toContain("https://www.geoapify.com/");
    expect(saved).toContain('name="month"');
    expect(saved).toContain('value="2026-03-01"');
    expect(saved).not.toContain('name="query"');
    expect(saved).not.toContain('name="candidate"');
    expect(saved).not.toContain("Confirm this place");
    expect(saved).not.toContain('value="The Ruby"');
    expect(saved).not.toContain("Save meeting");
    const discussed = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-11-01"
        venue={{ status: "ready", enteredName: "The Ruby", placeLabel: null }}
        meeting={meetingRow}
      />,
    );
    expect(discussed).toContain("Find this place");
    expect(discussed).toContain('value="The Ruby"');
    expect(discussed).toContain('value="2026-11-01"');
    expect(discussed).not.toContain("Save meeting");
    const savedMeeting = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-03-01"
        notice="venue"
        venue={{ status: "ready", enteredName: "Cal Anderson Park", placeLabel: null }}
        meeting={meetingRow}
        tab="meeting"
      />,
    );
    expect(savedMeeting).toContain('value="The Ruby"');
    expect(savedMeeting).toContain("Anyone with the link can read this.");
    expect(savedMeeting).not.toContain("Find this place");
    expect(savedMeeting).not.toContain("Powered by Geoapify");
    expect(savedMeeting).not.toContain("A confirmed pin is public.");
    expect(savedMeeting).not.toContain("Venue name saved.");
    expect(savedMeeting).not.toContain('name="enteredName"');
    expect(savedMeeting).not.toContain("Save venue name");
    expect(savedMeeting).not.toContain("Confirm this place");
    expect(savedMeeting).not.toContain('name="candidate"');
  });

  test("a confirmed place stays on the selected month and off Next meeting", () => {
    const confirmed = { status: "ready" as const, enteredName: "The Ruby", placeLabel: "The Ruby, Seattle, Washington" };
    const meetingRow = {
      status: "set" as const,
      date: "2026-11-18",
      time: "19:00",
      place: "The Ruby",
      pickId: "november",
    };
    const html = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-03-01"
        notice="place"
        venue={confirmed}
        meeting={meetingRow}
      />,
    );
    expect(html).toContain("Place confirmed. Anyone with the link can see this pin.");
    expect(html).toContain("Confirmed place: The Ruby, Seattle, Washington");
    expect(html).toContain("Clear confirmed place");
    expect(html).toContain("Find this place");
    expect(html).toContain("Choose a public bar, park, or similar.");
    expect(html).toContain("Powered by Geoapify");
    expect(html).toContain("does not change the next meeting or move a pin");
    expect(html).not.toContain("Save meeting");
    const cleared = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-03-01"
        notice="place-cleared"
        venue={{ status: "ready", enteredName: "The Ruby", placeLabel: null }}
        meeting={meetingRow}
      />,
    );
    expect(cleared).toContain("Confirmed place cleared. The venue name is still saved, and there is no pin.");
    expect(cleared).toContain("Find this place");
    expect(cleared).toContain("No place is confirmed for this month.");
    expect(cleared).not.toContain("Clear confirmed place");
    expect(cleared).not.toContain("Save meeting");
    const meeting = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-03-01"
        notice="place"
        venue={confirmed}
        meeting={meetingRow}
        tab="meeting"
      />,
    );
    expect(meeting).not.toContain("Place confirmed.");
    expect(meeting).not.toContain("Confirmed place:");
    expect(meeting).not.toContain("Clear confirmed place");
    expect(meeting).not.toContain("Find this place");
    expect(meeting).not.toContain("Powered by Geoapify");
    expect(meeting).toContain("Anyone with the link can read this.");
    expect(meeting).toContain("Save meeting");
    expect(meeting).not.toContain("Save venue name");
    expect(meeting).not.toContain('name="enteredName"');
  });

  test("a confirmation belongs to the tab that saved it", () => {
    const onPicks = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-11-01"
        notice="meeting"
      />,
    );
    expect(onPicks).toContain("Save month");
    expect(onPicks).not.toContain("The next meeting is saved.");
    expect(onPicks).not.toContain("Save meeting");
    const opened = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth={null}
        notice={null}
        tab="meeting"
      />,
    );
    expect(opened).toContain("Save meeting");
    expect(opened).not.toContain("The next meeting is saved.");
    const pickSavedOnMeeting = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-11-01"
        notice="saved"
        tab="meeting"
      />,
    );
    expect(pickSavedOnMeeting).not.toContain(">Saved.<");
    expect(pickSavedOnMeeting).not.toContain("The next meeting is saved.");
  });

  test("a failed meeting load still leaves Picks usable", () => {
    const html = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        {...editor}
        selectedMonth="2026-11-01"
        meeting={{ status: "error" }}
      />,
    );
    expect(html).toContain("Save month");
    expect(html).toContain('value="The Left Hand of Darkness"');
    expect(html).not.toContain("The meeting could not be loaded.");
    expect(html).not.toContain("Save meeting");
  });

  test("the edit page loads both records once, and a tab click does not ask the server", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const screenSource = readFileSync(new URL("./edit-screen.tsx", import.meta.url), "utf8");
    expect(page).toMatch(/const \[records, meeting, venue\] = await Promise\.all\(\[\s*loadEditorPicks\(\),\s*loadEditorMeeting\(/);
    expect(page).toMatch(/if \(access\.status !== "signed-in"\) \{\s*return <EditScreen access=\{access\} \/>;\s*\}/);
    expect(screenSource).toContain("history.pushState");
    expect(screenSource).not.toMatch(/router\.(push|replace)/);
    expect(screenSource).not.toMatch(/\bfetch\s*\(/);
    expect(screenSource).not.toContain("requireRecordKeeper");
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
    expect(html).not.toContain("Find this place");
    expect(html).toContain("Save month");
  });
});
