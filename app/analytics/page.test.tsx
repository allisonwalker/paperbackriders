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

import { loadReadingTotals } from "@/lib/reading";
import Page from "./page";

describe("analytics route", () => {
  test("does not check a session or render a map", () => {
    const source = readFileSync(path.join(import.meta.dirname, "page.tsx"), "utf8");

    expect(source).not.toMatch(/requireRecordKeeper|getSession|better-auth|from ["']@\/lib\/auth/);
    expect(source).not.toMatch(/["']use client["']/);
    expect(source).not.toMatch(/maplibre|geoapify|openlibrary/i);
  });

  test("puts the totals in the first HTML response", async () => {
    vi.mocked(loadReadingTotals).mockResolvedValue({
      status: "ready",
      bookCount: 2,
      pageTotal: 500,
      genres: [{ label: "Fantasy", count: 2 }],
    });

    const html = renderToStaticMarkup(await Page());

    expect(html).toContain("Book analytics");
    expect(html).toContain(">2<");
    expect(html).toContain(">500<");
    expect(html).toContain("Fantasy");
    expect(html).not.toContain("<canvas");
  });

  test("renders the error with no numbers when loading fails", async () => {
    vi.mocked(loadReadingTotals).mockResolvedValue({ status: "error" });

    const html = renderToStaticMarkup(await Page());

    expect(html).toContain("This page could not load.");
    expect(html).not.toContain("total-value");
    expect(html).not.toContain("books");
    expect(html).not.toContain("pages");
  });
});
