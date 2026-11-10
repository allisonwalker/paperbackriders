import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/server", () => ({
  connection: vi.fn(async () => undefined),
}));

vi.mock("@/lib/reading", () => ({
  loadReadingTotals: vi.fn(),
}));

vi.mock("@/lib/visits", () => ({
  loadMeetingPins: vi.fn(),
}));

import { loadReadingTotals } from "@/lib/reading";
import { loadMeetingPins } from "@/lib/visits";
import Page from "./page";

describe("analytics route", () => {
  test("does not check a session or proxy tiles", () => {
    const source = readFileSync(path.join(import.meta.dirname, "page.tsx"), "utf8");

    expect(source).not.toMatch(/requireRecordKeeper|getSession|better-auth|from ["']@\/lib\/auth/);
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/maplibre|geoapify|openlibrary|openfreemap/i);
    expect(source).toContain("loadMeetingPins");
    expect(source).toContain("Analytics · Paperback Riders");
    expect(source).not.toContain("Book analytics");
  });

  test("puts the totals in the first HTML response", async () => {
    vi.mocked(loadReadingTotals).mockResolvedValue({
      status: "ready",
      bookCount: 2,
      pageTotal: 500,
      genres: [{ label: "Fantasy", count: 2 }],
    });
    vi.mocked(loadMeetingPins).mockResolvedValue({ status: "ready", pins: [] });

    const html = renderToStaticMarkup(await Page());

    expect(html).toContain('src="/paperback-riders-mark.jpg"');
    expect(html).toContain("Paperback");
    expect(html).toContain("Riders");
    expect(html).not.toContain(">Analytics</h1>");
    expect(html).not.toContain("Book analytics");
    expect(html).toContain(">2<");
    expect(html).toContain(">500<");
    expect(html).toContain("Fantasy");
    expect(html).toContain("No places are confirmed yet.");
    expect(html).toContain("Powered by Geoapify");
    expect(html).not.toContain("<canvas");
  });

  test("renders the error with no numbers when loading fails", async () => {
    vi.mocked(loadReadingTotals).mockResolvedValue({ status: "error" });
    vi.mocked(loadMeetingPins).mockResolvedValue({ status: "error" });

    const html = renderToStaticMarkup(await Page());

    expect(html).toContain("This page could not load.");
    expect(html).not.toContain("total-value");
    expect(html).not.toContain("books");
    expect(html).not.toContain("pages");
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/analytics"');
  });
});
