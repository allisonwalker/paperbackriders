import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { ReadingState } from "@/lib/reading";
import type { PinsState } from "@/lib/visits";
import { AnalyticsPage } from "./analytics-page";

const noPins: PinsState = { status: "ready", pins: [] };

function render(reading: ReadingState, pins: PinsState = noPins): string {
  return renderToStaticMarkup(<AnalyticsPage reading={reading} pins={pins} />);
}

describe("book analytics page", () => {
  test("shows the three totals as text, then the map", () => {
    const html = render({
      status: "ready",
      bookCount: 12,
      pageTotal: 4812,
      genres: [
        {
          label: "Fantasy",
          count: 4,
          books: [
            {
              title: "Piranesi",
              month: "2026-11-01",
              coverUrl: "https://covers.openlibrary.org/b/id/111-L.jpg",
            },
            {
              title: "The Wicker Husband",
              month: "2026-10-01",
              coverUrl: "/covers/the-wicker-husband.png",
            },
            { title: "Missing", month: "2026-09-01", coverUrl: null },
            { title: "Elsewhere", month: "2026-08-01", coverUrl: "https://example.com/cover.jpg" },
          ],
        },
        {
          label: "History",
          count: 3,
          books: [
            { title: "Kindred", month: "2026-07-01", coverUrl: null },
            { title: "Wolf Hall", month: "2026-06-01", coverUrl: null },
            { title: "Circe", month: "2026-05-01", coverUrl: null },
          ],
        },
      ],
    });

    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    const heading = header.slice(header.indexOf("<h1"), header.indexOf("</h1>"));
    expect(heading).toContain("Paperback");
    expect(heading).toContain("Riders");
    expect(heading).toContain("<br/>");
    expect(heading).not.toContain("<a");
    expect(header).toContain('src="/paperback-riders-mark.jpg"');
    expect(header.match(/<h1/g)).toHaveLength(1);
    expect(header).not.toContain(">Analytics</h1>");
    expect(html).not.toContain("Book analytics");
    expect(header).not.toContain("public-nav");
    const nav = html.slice(html.indexOf('class="public-nav"'), html.indexOf("<section"));
    expect(html.indexOf("</header>")).toBeLessThan(html.indexOf('class="public-nav"'));
    expect(nav).toContain(">Catalog</a>");
    expect(nav).toContain('href="/analytics"');
    expect(nav).toMatch(/<a(?=[^>]*href="\/analytics")(?=[^>]*aria-current="page")[^>]*>/);
    expect(nav).not.toContain("/edit");
    expect(html).toContain("12");
    expect(html).toContain("books");
    expect(html).toContain("4,812");
    expect(html).toContain("pages");
    expect(html.indexOf("Fantasy")).toBeLessThan(html.indexOf("History"));
    expect(html).toContain("4 books · 33%");
    expect(html).toContain("3 books · 25%");
    expect(html).toContain(
      'aria-label="Fantasy, 4 books, 33%, Piranesi, The Wicker Husband, Missing, Elsewhere"',
    );
    expect(html).toContain('aria-label="History, 3 books, 25%, Kindred, Wolf Hall, Circe"');
    expect(html.indexOf("Reading totals")).toBeLessThan(html.indexOf("Meeting places"));
    expect(html).toContain("genre-list");
    expect(html).toContain("genre-tile");
    const genres = html.slice(html.indexOf("Genres"), html.indexOf("Meeting places"));
    expect(genres.match(/class="genre-tile"/g)).toHaveLength(7);
    expect(genres.match(/<img /g)).toHaveLength(2);
    expect(genres).toContain("https://covers.openlibrary.org/b/id/111-M.jpg");
    expect(genres).toContain("/covers/the-wicker-husband.png");
    expect(genres).not.toContain("example.com");
    expect(genres).not.toContain("title=");
    expect(genres.match(/<ul/g)).toHaveLength(1);
    expect(genres).not.toContain("popover");
    const css = readFileSync(path.join(import.meta.dirname, "../globals.css"), "utf8");
    expect(css).toMatch(/\.genre-bar\s*\{[^}]*gap:\s*2px;/s);
    expect(css).toMatch(/\.genre-tile\s*\{[^}]*width:\s*2\.25rem;\s*height:\s*3\.375rem;/s);
    expect(html).toContain("No places are confirmed yet.");
    expect(html).not.toContain("<canvas");
  });

  test("shows zero books, zero pages, and no genres", () => {
    const html = render({ status: "ready", bookCount: 0, pageTotal: 0, genres: [] });

    expect(html).toContain(">0<");
    expect(html).toContain("books");
    expect(html).toContain("pages");
    expect(html).toContain("No genres.");
    expect(html).not.toContain("genre-list");
  });

  test("rounds a partial percentage of every book, including books with no genre", () => {
    const html = render({
      status: "ready",
      bookCount: 6,
      pageTotal: 100,
      genres: [
        {
          label: "Memoir",
          count: 1,
          books: [{ title: "Lifeforms", month: "2026-11-01", coverUrl: null }],
        },
      ],
    });

    expect(html).toContain("1 book · 17%");
    expect(html).toContain('aria-label="Memoir, 1 book, 17%, Lifeforms"');
    const genres = html.slice(html.indexOf("Genres"), html.indexOf("Meeting places"));
    expect(genres).not.toContain("title=");
    expect(genres.match(/<ul/g)).toHaveLength(1);
    expect(genres).not.toContain("popover");
  });

  test("shows an error and no numbers when the read failed", () => {
    const html = render({ status: "error" });

    expect(html).toContain("This page could not load.");
    expect(html).toContain('role="alert"');
    expect(html).toContain('src="/paperback-riders-mark.jpg"');
    expect(html).toContain("Paperback");
    expect(html).toContain("Riders");
    expect(html).not.toContain("total-value");
    expect(html).not.toContain("books");
    expect(html).not.toContain("pages");
    expect(html).not.toContain("No genres.");
    expect(html).not.toContain("No places are confirmed yet.");
    expect(html).not.toContain("The map could not load.");
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/analytics"');
  });

  test("keeps the totals when the pin query fails", () => {
    const html = render(
      { status: "ready", bookCount: 2, pageTotal: 80, genres: [] },
      { status: "error" },
    );

    expect(html).toContain(">2<");
    expect(html).toContain(">80<");
    expect(html).toContain("The map could not load.");
    expect(html).not.toContain("No places are confirmed yet.");
  });
});
