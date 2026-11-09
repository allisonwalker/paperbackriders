import Link from "next/link";
import type { EditAccess } from "@/lib/edit-access";
import { signOutRecordKeeper } from "./actions";
import { SignInForm } from "./sign-in-form";

const MARK_SRC = "/paperback-riders-mark.jpg";

export function EditScreen({ access }: { access: EditAccess }) {
  return (
    <>
      <header className="brand">
        <div className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK_SRC} alt="" />
          <h1>
            <Link href="/">
              Paperback
              <br /> Riders
            </Link>
          </h1>
        </div>
      </header>
      <main>
        <section aria-label="Record keeper">
          {access.status === "unavailable" ? <Unavailable /> : null}
          {access.status === "signed-out" ? <SignedOut /> : null}
          {access.status === "signed-in" ? <SignedIn email={access.email} /> : null}
        </section>
      </main>
    </>
  );
}

function SignedOut() {
  return (
    <>
      <p className="kicker">Record keeper</p>
      <h2>Sign in</h2>
      <SignInForm />
    </>
  );
}

function SignedIn({ email }: { email: string }) {
  return (
    <>
      <p className="kicker">Record keeper</p>
      <h2>Signed in</h2>
      <p className="edit-note">
        You are signed in as <span className="keeper-email">{email}</span>.
      </p>
      <form className="edit-form" action={signOutRecordKeeper}>
        <button type="submit">Sign out</button>
      </form>
    </>
  );
}

function Unavailable() {
  return (
    <>
      <p className="kicker">Record keeper</p>
      <h2>Sign in</h2>
      <p role="alert">Sign-in could not be checked. The public page is still available.</p>
      <p>
        <Link href="/">Back to the public page</Link>
      </p>
    </>
  );
}
