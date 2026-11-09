import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { PlaceMatchList } from "./place-form";

describe("place match list", () => {
  test("one result is not selected, and the label is text", () => {
    const html = renderToStaticMarkup(
      <PlaceMatchList candidates={[{ token: "signed-token", label: 'The Ruby <script>alert("x")</script>' }]} />,
    );

    expect(html).toContain("1 match. Choose it to confirm the pin. Nothing is selected for you.");
    expect(html).toContain('type="radio"');
    expect(html).toContain('name="candidate"');
    expect(html).toContain('value="signed-token"');
    expect(html).toContain("required");
    expect(html).not.toContain("checked");
    expect(html).toContain("No pin is saved until you choose a match and confirm it.");
    expect(html).toContain("The Ruby &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("place finder source", () => {
  test("search is a submit, and the form has no coordinates or geocoder key", () => {
    const source = readFileSync(new URL("./place-form.tsx", import.meta.url), "utf8");

    expect(source).toContain("Find this place");
    expect(source).toContain("Powered by Geoapify");
    expect(source).toContain("https://www.geoapify.com/");
    expect(source).toContain('type="submit"');
    expect(source).not.toMatch(/onChange|defaultChecked|latitude|longitude|GEOAPIFY|fetch\s*\(/);
    expect(source).not.toContain("places/lookup");
    expect(source).not.toContain("requireRecordKeeper");
  });
});
