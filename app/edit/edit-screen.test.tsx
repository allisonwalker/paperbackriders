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
    expect(html).not.toContain('type="password"');
  });

  test("the signed-in editor can type a book or a prompt and does not include the meeting form", () => {
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
    expect(html).not.toContain('name="place"');
    expect(html).not.toContain("Next meeting");
    expect(html).not.toContain(MEETING_BLOCKS_DELETE);
    expect(html).toContain("Find a book");
    expect(html).toContain(">Search<");
    expect(html).not.toContain("Use this match");
    expect(html).toContain('name="lookupSource"');
    expect(html).toContain('value="open_library"');
    expect(html).toContain('value="OL45883W"');
    expect(html.match(/<form/g)).toHaveLength(3);
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
      />,
    );
    expect(empty).toContain("No months are saved yet.");
    expect(empty).toContain('type="month"');
    expect(empty).toContain('value="2026-11"');
    expect(empty).toContain("Save month");
    expect(empty).toContain("Find a book");
    expect(empty).toContain('value="manual"');
    expect(empty).not.toContain("OL45883W");
    expect(empty).not.toContain("Delete this month");

    const failed = renderToStaticMarkup(
      <EditScreen
        access={{ status: "signed-in", email: "keeper@example.com" }}
        records={{ status: "error" }}
        selectedMonth={null}
        notice="deleted"
        defaultMonth="2026-11"
      />,
    );
    expect(failed).toContain("The saved months could not be loaded.");
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
      />,
    );
    expect(html).toContain("Saved. The cover link was left off because it is not an Open Library cover.");
  });
});
