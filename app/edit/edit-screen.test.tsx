import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { EditScreen } from "./edit-screen";

describe("edit screen", () => {
  test("the signed-out state asks for an email and has no password", () => {
    const html = renderToStaticMarkup(<EditScreen access={{ status: "signed-out" }} />);
    expect(html).toContain("Sign in");
    expect(html).toContain("Email me a sign-in link");
    expect(html).toContain('type="email"');
    expect(html).toContain("Only the record keeper");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("Sign out");
    expect(html).toContain('href="/"');
  });

  test("the signed-in state shows the record keeper and no edit form", () => {
    const html = renderToStaticMarkup(<EditScreen access={{ status: "signed-in", email: "keeper@example.com" }} />);
    expect(html).toContain("Signed in");
    expect(html).toContain("keeper@example.com");
    expect(html).toContain("Sign out");
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("prompt");
    expect(html).not.toContain("Save");
  });

  test("a failed check does not present a signed-in editor", () => {
    const html = renderToStaticMarkup(<EditScreen access={{ status: "unavailable" }} />);
    expect(html).toContain("Sign-in could not be checked");
    expect(html).not.toContain("Signed in");
    expect(html).not.toContain('type="password"');
  });
});
