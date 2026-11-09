import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { FeaturedPickState } from "@/lib/picks";
import { PublicPage } from "./public-page";

const book: FeaturedPickState = {
  status: "ready",
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

function render(state: FeaturedPickState): string {
  return renderToStaticMarkup(<PublicPage state={state} />);
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

  test("leaves the hero empty when there is no pick", () => {
    const html = render({ status: "empty" });
    expect(html).toContain('aria-label="This month&#x27;s pick"');
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("could not load");
    expect(html).not.toContain("’s pick");
  });

  test("says the page could not load, which is different from an empty club", () => {
    const html = render({ status: "error" });
    expect(html).toContain("This page could not load.");
    expect(html).not.toContain("This month&#x27;s pick");
    expect(html).not.toContain("<h2");
    expect(html).toContain('src="/paperback-riders-mark.jpg"');
  });
});
