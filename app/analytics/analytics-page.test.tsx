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
        { label: "Fantasy", count: 4 },
        { label: "History", count: 3 },
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
    expect(html).toContain(">Catalog</a>");
    expect(html).toContain('href="/analytics"');
    expect(header).toContain('aria-current="page"');
    expect(header.indexOf('class="public-nav"')).toBeLessThan(header.indexOf('class="logo"'));
    expect(html).toContain("12");
    expect(html).toContain("books");
    expect(html).toContain("4,812");
    expect(html).toContain("pages");
    expect(html.indexOf("Fantasy")).toBeLessThan(html.indexOf("History"));
    expect(html).toContain("4 books");
    expect(html).toContain("3 books");
    expect(html.indexOf("Reading totals")).toBeLessThan(html.indexOf("Meeting places"));
    expect(html).toContain("genre-list");
    expect(html).not.toContain("genre-chart");
    expect(html).not.toContain("genre-tile");
    const genres = html.slice(html.indexOf("Genres"), html.indexOf("Meeting places"));
    expect(genres).not.toContain("<img");
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
