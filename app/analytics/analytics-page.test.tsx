import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { ReadingState } from "@/lib/reading";
import { AnalyticsPage } from "./analytics-page";

function render(reading: ReadingState): string {
  return renderToStaticMarkup(<AnalyticsPage reading={reading} />);
}

describe("book analytics page", () => {
  test("shows the three totals as text, with no map", () => {
    const html = render({
      status: "ready",
      bookCount: 12,
      pageTotal: 4812,
      genres: [
        { label: "Fantasy", count: 4 },
        { label: "History", count: 3 },
      ],
    });

    expect(html).toContain("Book analytics");
    expect(html).toContain("12");
    expect(html).toContain("books");
    expect(html).toContain("4,812");
    expect(html).toContain("pages");
    expect(html.indexOf("Fantasy")).toBeLessThan(html.indexOf("History"));
    expect(html).toContain("4 books");
    expect(html).toContain("3 books");
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("maplibre");
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
    expect(html).not.toContain("total-value");
    expect(html).not.toContain("books");
    expect(html).not.toContain("pages");
    expect(html).not.toContain("No genres.");
  });
});
