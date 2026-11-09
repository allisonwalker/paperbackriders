import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { NO_UPCOMING_MEETING, type MeetingView } from "@/lib/meeting";
import type { FeaturedPickState, HistoryEntry, HistoryState } from "@/lib/picks";
import { PublicPage } from "./public-page";

const book: FeaturedPickState = {
  status: "ready",
  month: "2026-10-01",
  pickLabel: "November\u2019s pick",
  hero: {
    kind: "book",
    monthLabel: "October 2026",
    title: "The Prestige",
    author: "Christopher Priest",
    publishedYear: 1995,
    pageCount: 404,
    genre: "Fiction",
    coverUrl: "https://covers.openlibrary.org/b/id/42-L.jpg",
  },
};

const none: MeetingView = { status: "none" };

const upcoming: MeetingView = {
  status: "upcoming",
  daysRemaining: 10,
  lead: "Meets in 10 days",
  dateLabel: "Wednesday, November 18, 2026",
  timeLabel: "7:00 PM",
  place: "Priya's house",
  discussing: "The Prestige by Christopher Priest",
};

const noHistory: HistoryState = { status: "ready", entries: [] };

function render(
  featured: FeaturedPickState,
  meeting: MeetingView = none,
  history: HistoryState = noHistory,
): string {
  return renderToStaticMarkup(<PublicPage featured={featured} meeting={meeting} history={history} />);
}

describe("public page", () => {
  test("shows the club name and the smaller mark, with the pick label out of the header", () => {
    const html = render({ status: "empty" });
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));

    expect(header).toContain("Paperback");
    expect(header).toContain("Riders");
    expect(header).toContain('src="/paperback-riders-mark.jpg"');
    expect(header).not.toContain("pick");
  });

  test("puts the current month label immediately above the cover and the facts on one line", () => {
    const html = render(book);
    const labelAt = html.indexOf("November’s pick");
    const coverAt = html.indexOf('<img src="https://covers.openlibrary.org/b/id/42-L.jpg"');
    const titleAt = html.indexOf("The Prestige");

    expect(labelAt).toBeGreaterThan(-1);
    expect(labelAt).toBeLessThan(coverAt);
    expect(coverAt).toBeLessThan(titleAt);
    expect(html).toContain("Christopher Priest");
    expect(html).toContain("1995 · 404 pages · Fiction");
    expect(html).not.toContain("October 2026");
  });

  test("omits an empty book field from that line", () => {
    const html = render({
      status: "ready",
      month: "2026-10-01",
      pickLabel: "November\u2019s pick",
      hero: {
        kind: "book",
        monthLabel: "October 2026",
        title: "The Prestige",
        author: "Christopher Priest",
        publishedYear: null,
        pageCount: null,
        genre: null,
        coverUrl: null,
      },
    });

    expect(html).toContain("November’s pick");
    expect(html).not.toContain("pages");
    expect(html).not.toContain("1995");
    expect(html.indexOf("<img")).toBe(html.lastIndexOf("<img"));
  });

  test("renders a prompt without book fields", () => {
    const html = render({
      status: "ready",
      month: "2026-03-01",
      pickLabel: "November\u2019s pick",
      hero: {
        kind: "prompt",
        monthLabel: "March 2026",
        promptText: "Read a book from the year you were born.",
      },
    });

    expect(html).toContain("November’s pick");
    expect(html).toContain("Read a book from the year you were born.");
    expect(html).not.toContain("pages");
    expect(html.indexOf("<img")).toBe(html.lastIndexOf("<img"));
  });

  test("does not render a cover from another host", () => {
    const html = render({
      status: "ready",
      month: "2026-10-01",
      pickLabel: "November\u2019s pick",
      hero: {
        kind: "book",
        monthLabel: "October 2026",
        title: "The Prestige",
        author: "Christopher Priest",
        publishedYear: null,
        pageCount: null,
        genre: null,
        coverUrl: null,
      },
    });

    expect(html).not.toContain("example.com");
  });

  test("leaves the hero empty when there is no pick and still says there is no meeting", () => {
    const html = render({ status: "empty" });
    expect(html).toContain('aria-label="This month&#x27;s pick"');
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("could not load");
    expect(html).not.toContain("’s pick");
    expect(html).toContain(NO_UPCOMING_MEETING);
    expect(html).not.toContain("Meets");
  });

  test("says the page could not load, which is different from an empty club or an unset meeting", () => {
    const html = render({ status: "error" }, upcoming);
    expect(html).toContain("This page could not load.");
    expect(html).not.toContain("This month&#x27;s pick");
    expect(html).not.toContain("<h2");
    expect(html).not.toContain(NO_UPCOMING_MEETING);
    expect(html).not.toContain("Meets in 10 days");
    expect(html).toContain('src="/paperback-riders-mark.jpg"');
  });

  test("puts the meeting dateline under the featured title", () => {
    const html = render(book, upcoming);
    const titleAt = html.indexOf("The Prestige");
    const leadAt = html.indexOf("Meets in 10 days");
    const whenAt = html.indexOf("Wednesday, November 18, 2026, 7:00 PM");
    const placeAt = html.indexOf("Priya&#x27;s house · discussing The Prestige by Christopher Priest");

    expect(titleAt).toBeGreaterThan(-1);
    expect(leadAt).toBeGreaterThan(titleAt);
    expect(whenAt).toBeGreaterThan(leadAt);
    expect(placeAt).toBeGreaterThan(whenAt);
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("maps.");
  });

  test("names the meeting's own pick when it is not the featured book", () => {
    const html = render(book, {
      ...upcoming,
      discussing: "Piranesi by Susanna Clarke",
    });

    expect(html).toContain("The Prestige");
    expect(html).toContain("discussing Piranesi by Susanna Clarke");
  });

  test("names a prompt meeting by the prompt text", () => {
    const html = render(
      {
        status: "ready",
        month: "2026-03-01",
        pickLabel: "November\u2019s pick",
        hero: {
          kind: "prompt",
          monthLabel: "March 2026",
          promptText: "Read a book from the year you were born.",
        },
      },
      {
        ...upcoming,
        lead: "Meets in 1 day",
        discussing: "Book Exchange",
      },
    );

    const featuredAt = html.indexOf("Read a book from the year you were born.");
    const leadAt = html.indexOf("Meets in 1 day");
    expect(featuredAt).toBeGreaterThan(-1);
    expect(leadAt).toBeGreaterThan(featuredAt);
    expect(html).toContain("discussing Book Exchange");
  });

  test("shows the empty sentence with no date, place, or day count", () => {
    const html = render(book, none);
    expect(html).toContain(NO_UPCOMING_MEETING);
    expect(html).not.toContain("Meets");
    expect(html).not.toContain("Wednesday");
    expect(html).not.toContain("7:00");
    expect(html).not.toContain("Priya");
    expect(html).not.toContain("discussing");
  });

  test("lists every month newest first under the pick, marking the featured month", () => {
    const entries: HistoryEntry[] = [
      {
        kind: "book",
        month: "2026-12-01",
        monthLabel: "December 2026",
        title: "Piranesi",
        author: "Susanna Clarke",
        pageCount: 272,
        marked: false,
      },
      {
        kind: "book",
        month: "2026-10-01",
        monthLabel: "October 2026",
        title: "The Prestige",
        author: "Christopher Priest",
        pageCount: 404,
        marked: true,
      },
      {
        kind: "prompt",
        month: "2026-03-01",
        monthLabel: "March 2026",
        promptText: "Read a book from the year you were born.",
        marked: false,
      },
    ];
    const html = render(book, none, { status: "ready", entries });
    const heroAt = html.indexOf("The Prestige");
    const decemberAt = html.indexOf("December 2026");
    const octoberAt = html.indexOf("October 2026");
    const marchAt = html.indexOf("March 2026");
    const list = html.slice(html.indexOf('aria-label="Reading history"'));

    expect(html).toContain("What we’ve read");
    expect(decemberAt).toBeGreaterThan(heroAt);
    expect(octoberAt).toBeGreaterThan(decemberAt);
    expect(marchAt).toBeGreaterThan(octoberAt);
    expect(list).toContain("Piranesi");
    expect(list).toContain("Susanna Clarke · 272 pages");
    expect(list).toContain("Christopher Priest · 404 pages");
    expect(list).toContain("<em");
    expect(list).toContain("Read a book from the year you were born.");
    expect(list).toContain('aria-current="true"');
    expect(list).not.toContain("1995");
    expect(list).not.toContain("Fiction");
    expect(list).not.toContain("<img");
    expect(list).not.toContain("<select");
    expect(list).not.toContain("<input");
    expect(list).not.toContain("openlibrary.org");
  });

  test("shows the history region with no months when the club has no picks", () => {
    const html = render({ status: "empty" });
    const list = html.slice(html.indexOf('aria-label="Reading history"'));
    expect(list).toContain("<ol");
    expect(list).not.toContain("<li");
    expect(html).not.toContain("could not load");
  });

  test("does not show an empty history when the page could not load", () => {
    const html = render({ status: "error" }, none, { status: "error" });
    expect(html).toContain("This page could not load.");
    expect(html).not.toContain("Reading history");
    expect(html).not.toContain("What we’ve read");
  });

  test("renders the place as text, including an address that looks like contact details", () => {
    const html = render(book, {
      ...upcoming,
      lead: "Meets today",
      place: "Ada's porch <script>alert(1)</script> ada@example.com",
    });

    expect(html).toContain("Meets today");
    expect(html).toContain("Ada&#x27;s porch &lt;script&gt;alert(1)&lt;/script&gt; ada@example.com");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("<a ");
  });
});
