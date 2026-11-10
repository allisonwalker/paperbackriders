import { readFileSync } from "node:fs";
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

    const heading = header.slice(header.indexOf("<h1"), header.indexOf("</h1>"));
    expect(heading).toContain("Paperback");
    expect(heading).toContain("Riders");
    expect(heading).toContain("<br/>");
    expect(heading).not.toContain("<a");
    expect(header).toContain('src="/paperback-riders-mark.jpg"');
    expect(header.match(/<h1/g)).toHaveLength(1);
    expect(header).not.toContain("pick");
    expect(header).not.toContain("public-nav");
    expect(header).not.toContain(">Catalog</a>");
    const nav = html.slice(html.indexOf('class="public-nav"'), html.indexOf("<section"));
    expect(html.indexOf("</header>")).toBeLessThan(html.indexOf('class="public-nav"'));
    expect(nav).toContain(">Catalog</a>");
    expect(nav).toContain(">Analytics</a>");
    expect(nav).toContain('href="/"');
    expect(nav).toContain('href="/analytics"');
    expect(nav).toMatch(/<a(?=[^>]*href="\/")(?=[^>]*aria-current="page")[^>]*>/);
    expect(nav).not.toMatch(/<a(?=[^>]*href="\/analytics")(?=[^>]*aria-current="page")[^>]*>/);
    expect(nav).not.toContain("/edit");
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

  test("says the next book has not been selected", () => {
    const html = render({ status: "unselected" });

    expect(html).toContain("The next book hasn&#x27;t been selected. Watch this space.");
    expect(html).toContain("<h2");
    expect(html).not.toContain("could not load");
  });

  test("shows an unscheduled meeting without a date or a place", () => {
    const html = render(book, {
      status: "unscheduled",
      lead: "Date and place to come",
      discussing: "The Prestige by Christopher Priest",
    });

    expect(html).toContain("Date and place to come");
    expect(html).toContain("discussing The Prestige by Christopher Priest");
    expect(html).not.toContain("Meets in");
    expect(html).not.toContain("Priya");
  });

  test("leaves the hero empty when there is no pick and still says there is no meeting", () => {
    const html = render({ status: "empty" });
    expect(html).toContain('aria-label="Current pick"');
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
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/analytics"');
    expect(html).toContain('class="public-nav"');
    expect(html).not.toContain("/edit");
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
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Save meeting");
    expect(html).not.toContain('name="place"');
    expect(html).not.toContain(">Picks<");
    expect(html).not.toContain(">Next meeting<");
    expect(html).not.toContain("tab=meeting");
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
        genre: "Fantasy",
        coverUrl: "https://covers.openlibrary.org/b/id/42-M.jpg",
        marked: false,
        entryKey: "2026-12-01",
      },
      {
        kind: "book",
        month: "2026-10-01",
        monthLabel: "October 2026",
        title: "The Prestige",
        author: "Christopher Priest",
        pageCount: 404,
        genre: null,
        coverUrl: null,
        marked: true,
        entryKey: "2026-10-01",
      },
      {
        kind: "book",
        month: "2026-10-01",
        monthLabel: "October 2026",
        title: "The Wicker Husband",
        author: "Ursula Wills",
        pageCount: 336,
        genre: "Romance",
        coverUrl: "/covers/the-wicker-husband.png",
        marked: true,
        entryKey: "2026-10-01:also",
      },
      {
        kind: "prompt",
        month: "2026-03-01",
        monthLabel: "March 2026",
        promptText: "Read a book from the year you were born.",
        marked: false,
        entryKey: "2026-03-01",
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
    expect(list).toContain('<span class="author">Susanna Clarke</span>');
    expect(list).not.toContain("Susanna Clarke ·");
    expect(list).toContain("272 pages");
    expect(list).toContain("Fantasy");
    expect(list).toContain('<img src="https://covers.openlibrary.org/b/id/42-M.jpg"');
    expect(list.indexOf("The Prestige")).toBeLessThan(list.indexOf("The Wicker Husband"));
    expect(list).toContain('<span class="author">Christopher Priest</span>');
    expect(list).toContain("404 pages");
    expect(list).toContain('<img src="/covers/the-wicker-husband.png"');
    expect(list).toContain("336 pages");
    expect(list).toContain("Romance");
    expect(list).toContain("<em");
    expect(list).toContain("Read a book from the year you were born.");
    const promptAt = list.indexOf("Read a book from the year you were born.");
    const promptRow = list.slice(list.lastIndexOf("<li", promptAt), list.indexOf("</li>", promptAt));
    expect(promptRow).toContain("<em");
    expect(promptRow).not.toContain("<img");
    expect(list).toContain('aria-current="true"');
    expect(list).not.toContain("1995");
    expect(list).not.toContain("Fiction");
    expect(list).not.toContain("<select");
    expect(list).not.toContain("<input");
    expect(list).not.toContain("example.com");
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
    const datelineStart = html.indexOf('class="dateline"');
    const dateline = html.slice(datelineStart, html.indexOf("</p>", datelineStart));
    expect(dateline).not.toContain("<script>alert");
    expect(dateline).not.toContain("mailto:");
    expect(dateline).not.toContain("<a ");
  });

  test("shares the catalog lockup, with the mark left of the name until 720px", () => {
    const page = readFileSync(new URL("./public-page.tsx", import.meta.url), "utf8");
    const analytics = readFileSync(new URL("./analytics/analytics-page.tsx", import.meta.url), "utf8");
    const masthead = readFileSync(new URL("./public-masthead.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
    const narrow = css.slice(css.indexOf("@media (max-width: 720px)"));

    expect(page).toContain("<PublicMasthead />");
    expect(analytics).toContain("<PublicMasthead />");
    expect(page).toContain('<PublicNav current="catalog" />');
    expect(analytics).toContain('<PublicNav current="analytics" />');
    expect(masthead.indexOf("<img")).toBeLessThan(masthead.indexOf("<h1>"));
    expect(masthead).not.toContain("next/link");
    expect(masthead).not.toContain("public-nav");
    expect(css).toMatch(/\.logo h1 \{[^}]*font-size: clamp\(2\.7rem, 6\.6vw, 5rem\)/);
    expect(css).toMatch(/\.public-nav a \{[^}]*font-size: 0\.95rem/);
    expect(css).toMatch(/\.public-nav \{[^}]*border-top: 3px solid var\(--ink\)/);
    expect(css).toMatch(/\.public-nav a\[aria-current="page"\] \{[^}]*background: var\(--ink\)/);
    expect(css).toMatch(/\.public-nav a\[aria-current="page"\] \{[^}]*color: var\(--paper\)/);
    expect(css).not.toMatch(/\.public-nav[^}]*box-shadow/);
    expect(css).not.toMatch(/\.public-nav[^}]*--shirt/);
    expect(css).toMatch(/main > \.public-nav \+ section[\s\S]*border-top: 0/);
    expect(narrow).toContain("flex-direction: column");
    expect(narrow).toContain("order: -1");
    expect(narrow).toMatch(/\.public-nav \{[^}]*flex-wrap: nowrap/);
    expect(narrow).toMatch(/\.logo h1 \{[^}]*font-size: clamp\(2\.2rem, 12vw, 3\.1rem\)/);
  });
});
