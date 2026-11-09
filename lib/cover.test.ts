import { describe, expect, test } from "vitest";
import nextConfig from "../next.config";
import { displayCoverUrl } from "./cover";

describe("cover host", () => {
  test("keeps an https cover on covers.openlibrary.org", () => {
    expect(displayCoverUrl("https://covers.openlibrary.org/b/id/123-L.jpg")).toBe(
      "https://covers.openlibrary.org/b/id/123-L.jpg",
    );
  });

  test("omits any other host, including a lookalike", () => {
    expect(displayCoverUrl("https://example.com/cover.jpg")).toBeNull();
    expect(displayCoverUrl("https://covers.openlibrary.org.evil.test/b/id/1.jpg")).toBeNull();
    expect(displayCoverUrl("http://covers.openlibrary.org/b/id/1.jpg")).toBeNull();
    expect(displayCoverUrl("not a url")).toBeNull();
    expect(displayCoverUrl("")).toBeNull();
    expect(displayCoverUrl(null)).toBeNull();
  });

  test("the image optimizer's remote allowlist is covers.openlibrary.org only", () => {
    const patterns = nextConfig.images?.remotePatterns ?? [];
    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({
      protocol: "https",
      hostname: "covers.openlibrary.org",
    });
    expect(nextConfig.images).not.toHaveProperty("domains");
  });
});
