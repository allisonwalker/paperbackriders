"use client";

import { useActionState } from "react";
import { requestMagicLink, type MagicLinkState } from "./actions";

const initial: MagicLinkState = { status: "idle" };

export function SignInForm() {
  const [state, action, pending] = useActionState(requestMagicLink, initial);

  return (
    <form className="edit-form" action={action}>
      <p className="edit-note">
        Only the record keeper can change the club&apos;s records. Opening this page does not sign anyone in.
      </p>
      <label htmlFor="record-keeper-email">Email</label>
      <input
        id="record-keeper-email"
        name="email"
        type="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
      />
      <button type="submit" disabled={pending}>
        {pending ? "Sending..." : "Email me a sign-in link"}
      </button>
      {state.status === "sent" ? (
        <p role="status">Check that inbox for a sign-in link. It expires in five minutes.</p>
      ) : null}
      {state.status === "rejected" ? (
        <p role="alert">That address cannot sign in.</p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert">The sign-in email could not be sent. Nothing was saved.</p>
      ) : null}
    </form>
  );
}
