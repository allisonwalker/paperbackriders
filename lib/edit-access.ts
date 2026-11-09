import { getSessionCookie } from "better-auth/cookies";
import { headers } from "next/headers";
import { isRecordKeeperEmail, logAuthFailure, normalizeEmail } from "./auth-policy";
import { getAuth } from "./auth";

export type EditAccess =
  | { status: "signed-out" }
  | { status: "signed-in"; email: string }
  | { status: "unavailable" };

/**
 * Chooses the edit screen. A missing cookie renders the signed-out form.
 * A present cookie is re-read from the session store before anyone is
 * treated as signed in. This is not authorization for a write.
 */
export async function decideEditAccess(input: {
  hasSessionCookie: boolean;
  allowlisted: string | null | undefined;
  readSession: () => Promise<{ email: string | null | undefined } | null>;
}): Promise<EditAccess> {
  if (!input.hasSessionCookie) return { status: "signed-out" };

  try {
    const session = await input.readSession();
    const email = normalizeEmail(session?.email);
    if (!email || !isRecordKeeperEmail(email, input.allowlisted)) {
      return { status: "signed-out" };
    }
    return { status: "signed-in", email };
  } catch (error) {
    logAuthFailure(error);
    return { status: "unavailable" };
  }
}

export async function readEditAccess(): Promise<EditAccess> {
  const headerList = await headers();
  const hasSessionCookie = getSessionCookie(headerList) !== null;
  return decideEditAccess({
    hasSessionCookie,
    allowlisted: process.env.RECORD_KEEPER_EMAIL,
    readSession: async () => {
      const session = await getAuth().api.getSession({ headers: headerList });
      return session?.user ? { email: session.user.email } : null;
    },
  });
}
