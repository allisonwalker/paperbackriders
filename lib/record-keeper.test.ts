import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { decideEditAccess } from "./edit-access";
import { asRecordKeeper, RecordKeeperRequiredError, requireRecordKeeper } from "./record-keeper";

const root = path.resolve(import.meta.dirname, "..");

describe("requireRecordKeeper", () => {
  test("rejects a request with no session", async () => {
    await expect(requireRecordKeeper(async () => null, "keeper@example.com")).rejects.toBeInstanceOf(
      RecordKeeperRequiredError,
    );
  });

  test("rejects a session for any other email", async () => {
    await expect(
      requireRecordKeeper(async () => ({ email: "member@example.com" }), "keeper@example.com"),
    ).rejects.toBeInstanceOf(RecordKeeperRequiredError);
  });

  test("re-reads the session and the allowlisted email on every call", async () => {
    let reads = 0;
    const readSession = async () => {
      reads += 1;
      return { email: "keeper@example.com" };
    };

    await expect(requireRecordKeeper(readSession, "keeper@example.com")).resolves.toEqual({
      email: "keeper@example.com",
    });
    await expect(requireRecordKeeper(readSession, "other@example.com")).rejects.toBeInstanceOf(
      RecordKeeperRequiredError,
    );
    expect(reads).toBe(2);
  });

  test("does not run a write that skips the check or fails it", async () => {
    let ran = false;
    const write = async () => {
      ran = true;
      return "saved";
    };

    await expect(asRecordKeeper(write, async () => null, "keeper@example.com")).rejects.toBeInstanceOf(
      RecordKeeperRequiredError,
    );
    await expect(
      asRecordKeeper(write, async () => ({ email: "member@example.com" }), "keeper@example.com"),
    ).rejects.toBeInstanceOf(RecordKeeperRequiredError);
    expect(ran).toBe(false);

    await expect(asRecordKeeper(write, async () => ({ email: "keeper@example.com" }), "keeper@example.com")).resolves.toBe(
      "saved",
    );
    expect(ran).toBe(true);
  });
});

describe("edit screen access", () => {
  test("a missing cookie renders signed out and does not read the session", async () => {
    const readSession = vi.fn(async () => ({ email: "keeper@example.com" }));
    await expect(
      decideEditAccess({ hasSessionCookie: false, allowlisted: "keeper@example.com", readSession }),
    ).resolves.toEqual({ status: "signed-out" });
    expect(readSession).not.toHaveBeenCalled();
  });

  test("a cookie for another email still renders signed out", async () => {
    await expect(
      decideEditAccess({
        hasSessionCookie: true,
        allowlisted: "keeper@example.com",
        readSession: async () => ({ email: "member@example.com" }),
      }),
    ).resolves.toEqual({ status: "signed-out" });
  });

  test("a record keeper session renders signed in", async () => {
    await expect(
      decideEditAccess({
        hasSessionCookie: true,
        allowlisted: "keeper@example.com",
        readSession: async () => ({ email: "Keeper@Example.com" }),
      }),
    ).resolves.toEqual({ status: "signed-in", email: "keeper@example.com" });
  });

  test("a failed session read does not log the link, the token, or the secret", async () => {
    const secret = "auth-secret-value";
    const databaseUrl = "postgres://user:password@db.example/paperback";
    const link = "https://club.example/api/auth/magic-link/verify?token=session-token-value";
    const previousSecret = process.env.BETTER_AUTH_SECRET;
    const previousDatabase = process.env.DATABASE_URL;
    process.env.BETTER_AUTH_SECRET = secret;
    process.env.DATABASE_URL = databaseUrl;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    let logged = "";
    try {
      await expect(
        decideEditAccess({
          hasSessionCookie: true,
          allowlisted: "keeper@example.com",
          readSession: async () => {
            throw new Error(`session read failed ${link} ${secret} ${databaseUrl}`);
          },
        }),
      ).resolves.toEqual({ status: "unavailable" });
      logged = spy.mock.calls.flat().join(" ");
    } finally {
      process.env.BETTER_AUTH_SECRET = previousSecret;
      process.env.DATABASE_URL = previousDatabase;
      spy.mockRestore();
    }

    expect(logged).not.toContain("session-token-value");
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain(databaseUrl);
    expect(logged).not.toContain("magic-link/verify");
  });
});

describe("pages do not treat a render check as authorization", () => {
  test("the public page does not create or require a session", () => {
    const page = readFileSync(path.join(root, "app/page.tsx"), "utf8");
    const view = readFileSync(path.join(root, "app/public-page.tsx"), "utf8");
    expect(page).not.toMatch(/better-auth|requireRecordKeeper|getAuth|readEditAccess/);
    expect(view).not.toMatch(/better-auth|requireRecordKeeper|getAuth|readEditAccess/);
  });

  test("the edit screen reads access for rendering and does not call requireRecordKeeper", () => {
    const page = readFileSync(path.join(root, "app/edit/page.tsx"), "utf8");
    const screen = readFileSync(path.join(root, "app/edit/edit-screen.tsx"), "utf8");
    expect(page).toContain("readEditAccess");
    expect(page).not.toContain("requireRecordKeeper");
    expect(screen).not.toContain("requireRecordKeeper");
    expect(screen).not.toContain("type=\"password\"");
  });

  test("pick and meeting reads are not write paths", () => {
    for (const file of ["lib/picks.ts", "lib/meeting.ts"]) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    }
  });
});
