import { describe, expect, test, vi } from "vitest";
import { deliverMagicLink, MagicLinkClosedError, MagicLinkDeliveryError } from "./auth-mail";

const env = {
  RECORD_KEEPER_EMAIL: "keeper@example.com",
  RESEND_API_KEY: "resend-api-key-value",
  RESEND_FROM: "Paperback Riders <auth@example.com>",
  BETTER_AUTH_SECRET: "auth-secret-value",
  DATABASE_URL: "postgres://user:password@db.example/paperback",
};

describe("magic link delivery", () => {
  test("sends one Resend email to the allowlisted address and does not log the link", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    const url = "https://club.example/api/auth/magic-link/verify?token=session-token-value&callbackURL=%2Fedit";

    try {
      await deliverMagicLink({
        email: " Keeper@Example.com ",
        url,
        env,
        fetch: fetchMock,
      });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }

    expect(fetchMock).toHaveBeenCalledOnce();
    const [target, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(target).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${env.RESEND_API_KEY}`);
    const body = JSON.parse(String(init.body)) as { from: string; to: string[]; text: string };
    expect(body.from).toBe(env.RESEND_FROM);
    expect(body.to).toEqual(["keeper@example.com"]);
    const sent = new URL(body.text.split("\n").find((line) => line.startsWith("https://")) ?? "");
    expect(sent.searchParams.get("callbackURL")).toBe("/edit");
    expect(sent.searchParams.get("token")).toBe("session-token-value");
    expect(sent.searchParams.has("errorCallbackURL")).toBe(false);
  });

  test("replaces an outside return address before the email is sent", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    await deliverMagicLink({
      email: "keeper@example.com",
      url: "https://club.example/api/auth/magic-link/verify?token=session-token-value&callbackURL=https%3A%2F%2Fevil.example",
      env,
      fetch: fetchMock,
    });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = JSON.parse(String(init.body)) as { text: string };
    expect(body.text).not.toContain("evil.example");
    expect(body.text).toContain("callbackURL=%2Fedit");
  });

  test("does not send when the link is not a magic-link verify URL", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    await expect(
      deliverMagicLink({
        email: "keeper@example.com",
        url: "https://evil.example/steal",
        env,
        fetch: fetchMock,
      }),
    ).rejects.toBeInstanceOf(MagicLinkDeliveryError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("fails closed for any other address and does not call Resend", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    await expect(
      deliverMagicLink({
        email: "member@example.com",
        url: "https://club.example/api/auth/magic-link/verify?token=session-token-value",
        env,
        fetch: fetchMock,
      }),
    ).rejects.toBeInstanceOf(MagicLinkClosedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("fails closed when the allowlist is empty", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    await expect(
      deliverMagicLink({
        email: "keeper@example.com",
        url: "https://club.example/api/auth/magic-link/verify?token=session-token-value",
        env: { ...env, RECORD_KEEPER_EMAIL: "" },
        fetch: fetchMock,
      }),
    ).rejects.toBeInstanceOf(MagicLinkClosedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("does not log the link or the API key when Resend rejects the send", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const url = "https://club.example/api/auth/magic-link/verify?token=session-token-value";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ html: url, key: env.RESEND_API_KEY }), { status: 422 }));

    let logged = "";
    try {
      await expect(deliverMagicLink({ email: "keeper@example.com", url, env, fetch: fetchMock })).rejects.toBeInstanceOf(
        MagicLinkDeliveryError,
      );
      logged = spy.mock.calls.flat().join(" ");
    } finally {
      spy.mockRestore();
    }

    expect(logged).toContain("Resend status 422");
    expect(logged).not.toContain("session-token-value");
    expect(logged).not.toContain(env.RESEND_API_KEY);
    expect(logged).not.toContain(env.DATABASE_URL);
    expect(logged).not.toContain("magic-link/verify");
  });
});
