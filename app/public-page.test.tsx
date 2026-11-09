import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { FeaturedPickState } from "@/lib/picks";
import { PublicPage } from "./public-page";

const book: FeaturedPickState = {
  status: "ready",
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

function render(state: FeaturedPickState, showLogo = false): string {
  return renderToStaticMarkup(<PublicPage state={state} showLogo={showLogo} />);
}

describe("public page", () => {
  test("shows the club name, and the logo only when the file is present", () => {
    const withoutLogo = render({ status: "empty" });
    expect(withoutLogo).toContain("Paperback");
    expect(withoutLogo).toContain("Riders");
    expect(withoutLogo).not.toContain("paperback-riders-logo.png");

    const withLogo = render({ status: "empty" }, true);
    expect(withLogo).toContain('alt="Paperback Riders"');
    expect(withLogo).toContain('src="/paperback-riders-logo.png"');
  });

  test("renders a book and omits an empty field", () => {
    const html = render(book);
    expect(html).toContain("The Prestige");
    expect(html).toContain("Christopher Priest");
    expect(html).toContain("1995");
    expect(html).toContain("404 pages");
    expect(html).toContain("Fiction");
    expect(html).toContain("https://covers.openlibrary.org/b/id/42-L.jpg");

    const sparse = render({
      status: "ready",
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
    expect(sparse).not.toContain("pages");
    expect(sparse).not.toContain("1995");
    expect(sparse).not.toContain("<img");
  });

  test("renders a prompt without book fields", () => {
    const html = render({
      status: "ready",
      hero: {
        kind: "prompt",
        monthLabel: "March 2026",
        promptText: "Read a book from the year you were born.",
      },
    });

    expect(html).toContain("Read a book from the year you were born.");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("pages");
  });

  test("does not render a cover from another host", () => {
    const html = render({
      status: "ready",
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
    expect(html).not.toContain("<img");
  });

  test("leaves the hero empty when there is no pick", () => {
    const html = render({ status: "empty" });
    expect(html).toContain('aria-label="This month&#x27;s pick"');
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("could not load");
  });

  test("says the page could not load, which is different from an empty club", () => {
    const html = render({ status: "error" });
    expect(html).toContain("This page could not load.");
    expect(html).not.toContain("This month&#x27;s pick");
    expect(html).not.toContain("<h2");
  });
});
