import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { MeetingPin } from "@/lib/visits";
import { MeetingMap, PinCovers, PinVisits } from "./meeting-map";

const hostile = "The Ruby <img src=x onerror=alert(1)>";

const pin: MeetingPin = {
  id: "11111111-1111-4111-8111-111111111111",
  label: hostile,
  latitude: 47.61,
  longitude: -122.33,
  visits: [
    {
      kind: "book",
      month: "2026-11-01",
      monthLabel: "November 2026",
      title: "Piranesi <script>",
      author: "Susanna Clarke",
      coverUrl: "https://covers.openlibrary.org/b/id/42-L.jpg",
    },
    {
      kind: "prompt",
      month: "2026-10-01",
      monthLabel: "October 2026",
      promptText: "A book you loved at twelve",
    },
    {
      kind: "book",
      month: "2026-09-01",
      monthLabel: "September 2026",
      title: "Kindred",
      author: "Octavia Butler",
      coverUrl: null,
    },
  ],
};

describe("meeting map view", () => {
  test("an empty pin set is a sentence, not a map", () => {
    const html = renderToStaticMarkup(<MeetingMap pins={{ status: "ready", pins: [] }} />);

    expect(html).toContain("No places are confirmed yet.");
    expect(html).toContain("Powered by Geoapify");
    expect(html).toContain('href="https://www.geoapify.com/"');
    expect(html).not.toContain("meeting-map");
    expect(html).not.toContain("The map could not load.");
  });

  test("a database error is an error, and the empty sentence is absent", () => {
    const html = renderToStaticMarkup(<MeetingMap pins={{ status: "error" }} />);

    expect(html).toContain("The map could not load.");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("No places are confirmed yet.");
    expect(html).not.toContain("meeting-map");
    expect(html).toContain("Powered by Geoapify");
  });

  test("confirmed pins render a map frame and do not list visits until a click", () => {
    const html = renderToStaticMarkup(<MeetingMap pins={{ status: "ready", pins: [pin] }} />);

    expect(html).toContain("meeting-map");
    expect(html).not.toContain("No places are confirmed yet.");
    expect(html).not.toContain("The map could not load.");
    expect(html).not.toContain("Piranesi");
  });
});

describe("pin hover and click text", () => {
  test("hover shows stored covers and skips a prompt and a missing cover", () => {
    const html = renderToStaticMarkup(<PinCovers pin={pin} />);

    expect(html).toContain("The Ruby &lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain('src="https://covers.openlibrary.org/b/id/42-L.jpg"');
    expect(html).toContain('alt="Piranesi &lt;script&gt;"');
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("example.com");
  });

  test("click lists every visit, newest month first, as text", () => {
    const html = renderToStaticMarkup(<PinVisits pin={pin} />);

    expect(html.indexOf("November 2026")).toBeLessThan(html.indexOf("October 2026"));
    expect(html.indexOf("October 2026")).toBeLessThan(html.indexOf("September 2026"));
    expect(html).toContain("Piranesi &lt;script&gt;");
    expect(html).toContain("Susanna Clarke");
    expect(html).toContain("A book you loved at twelve");
    expect(html).toContain("Kindred");
    expect(html).toContain("Octavia Butler");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
  });

  test("the view does not proxy tiles or read a geocoder key", () => {
    const source = readFileSync(path.join(import.meta.dirname, "meeting-map.tsx"), "utf8");
    const page = readFileSync(path.join(import.meta.dirname, "page.tsx"), "utf8");

    expect(source).not.toMatch(/NEXT_PUBLIC_|GEOAPIFY_API_KEY|api_key/);
    expect(page).not.toMatch(/requireRecordKeeper|getSession|better-auth|from ["']@\/lib\/auth/);
    expect(page).not.toMatch(/openfreemap|tiles\.|rewrite/);
    expect(page).toContain("loadMeetingPins");
    expect(page).toContain("loadReadingTotals");
  });
});
