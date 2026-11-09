import { isRecordKeeperEmail, normalizeEmail } from "./auth-policy";

/**
 * Authorization for inserting, updating, or deleting a pick or the meeting.
 * Call this inside the write. The edit screen's cookie check only chooses
 * what to render, and a write that skips this function is not authorized.
 */
export class RecordKeeperRequiredError extends Error {
  constructor() {
    super("A record keeper session is required.");
    this.name = "RecordKeeperRequiredError";
  }
}

export type SessionEmail = { email: string | null | undefined };

export async function requireRecordKeeper(
  readSession: () => Promise<SessionEmail | null> = readSessionEmail,
  allowlisted: string | null | undefined = process.env.RECORD_KEEPER_EMAIL,
): Promise<{ email: string }> {
  const session = await readSession();
  const email = normalizeEmail(session?.email);
  if (!email || !isRecordKeeperEmail(email, allowlisted)) {
    throw new RecordKeeperRequiredError();
  }
  return { email };
}

export async function asRecordKeeper<T>(
  write: (keeper: { email: string }) => Promise<T>,
  readSession?: () => Promise<SessionEmail | null>,
  allowlisted?: string | null,
): Promise<T> {
  const keeper = await requireRecordKeeper(readSession, allowlisted);
  return write(keeper);
}

async function readSessionEmail(): Promise<SessionEmail | null> {
  const { headers } = await import("next/headers");
  const { getAuth } = await import("./auth");
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user ? { email: session.user.email } : null;
}
