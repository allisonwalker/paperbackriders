"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { isRecordKeeperEmail, logAuthFailure, normalizeEmail } from "@/lib/auth-policy";

export type MagicLinkState = {
  status: "idle" | "sent" | "rejected" | "error";
};

export async function requestMagicLink(
  _previous: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const submitted = formData.get("email");
  const email = normalizeEmail(typeof submitted === "string" ? submitted : null);
  if (!email || !isRecordKeeperEmail(email, process.env.RECORD_KEEPER_EMAIL)) {
    return { status: "rejected" };
  }

  try {
    await getAuth().api.signInMagicLink({
      body: {
        email,
        callbackURL: "/edit",
      },
      headers: await headers(),
    });
    return { status: "sent" };
  } catch (error) {
    logAuthFailure(error);
    return { status: "error" };
  }
}

export async function signOutRecordKeeper(): Promise<void> {
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch (error) {
    logAuthFailure(error);
  }
  redirect("/edit");
}
