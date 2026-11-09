import Link from "next/link";
import { formatClubMonth } from "@/lib/club-date";
import type { EditAccess } from "@/lib/edit-access";
import type { EditorPicksState, PickRecord } from "@/lib/picks";
import { monthInputValue } from "@/lib/validation";
import type { EditorNotice } from "./editor-query";
import { signOutRecordKeeper } from "./actions";
import { DeletePickForm, PickForm, type PickFormValues } from "./pick-form";
import { SignInForm } from "./sign-in-form";

const MARK_SRC = "/paperback-riders-mark.jpg";

type SignedInAccess = Extract<EditAccess, { status: "signed-in" }>;

type EditScreenProps =
  | { access: Exclude<EditAccess, SignedInAccess> }
  | {
      access: SignedInAccess;
      records: EditorPicksState;
      selectedMonth: string | null;
      notice: EditorNotice | null;
      defaultMonth: string;
    };

export function EditScreen(props: EditScreenProps) {
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
          <EditorBody {...props} />
        </section>
      </main>
    </>
  );
}

function isSignedIn(props: EditScreenProps): props is Extract<EditScreenProps, { access: SignedInAccess }> {
  return props.access.status === "signed-in";
}

function EditorBody(props: EditScreenProps) {
  if (!isSignedIn(props)) {
    return props.access.status === "unavailable" ? <Unavailable /> : <SignedOut />;
  }

  return (
    <SignedIn
      email={props.access.email}
      records={props.records}
      selectedMonth={props.selectedMonth}
      notice={props.notice}
      defaultMonth={props.defaultMonth}
    />
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

function SignedIn({
  email,
  records,
  selectedMonth,
  notice,
  defaultMonth,
}: {
  email: string;
  records: EditorPicksState;
  selectedMonth: string | null;
  notice: EditorNotice | null;
  defaultMonth: string;
}) {
  const selected =
    records.status === "ready" && selectedMonth
      ? (records.picks.find((pick) => pick.month === selectedMonth) ?? null)
      : null;
  const monthForInput = selected
    ? monthInputValue(selected.month)
    : selectedMonth
      ? monthInputValue(selectedMonth)
      : defaultMonth;

  return (
    <>
      <p className="kicker">Record keeper</p>
      <h2>Records</h2>
      <p className="edit-note">
        You are signed in as <span className="keeper-email">{email}</span>.
      </p>
      <form className="edit-form" action={signOutRecordKeeper}>
        <button type="submit">Sign out</button>
      </form>
      {/* The meeting form is a later sibling of this block. */}
      <div className="editor-pick">
        <h3 id="month-pick-heading" className="edit-heading">
          {"Month\u2019s pick"}
        </h3>
        {notice ? <p role="status">{noticeText(notice)}</p> : null}
        {records.status === "error" ? (
          <p role="alert">The saved months could not be loaded.</p>
        ) : (
          <MonthList picks={records.picks} selectedMonth={selected?.month ?? null} adding={selectedMonth === null} />
        )}
        <PickForm key={`edit-${selected?.id ?? selectedMonth ?? "new"}`} values={formValues(selected, monthForInput)} />
        {selected ? <DeletePickForm key={`delete-${selected.id}`} month={selected.month} /> : null}
      </div>
    </>
  );
}

function MonthList({
  picks,
  selectedMonth,
  adding,
}: {
  picks: PickRecord[];
  selectedMonth: string | null;
  adding: boolean;
}) {
  const ordered = [...picks].sort((left, right) => (left.month < right.month ? 1 : left.month > right.month ? -1 : 0));
  if (ordered.length === 0) return <p>No months are saved yet.</p>;

  return (
    <nav aria-label="Saved months">
      <ul className="month-list">
        <li>
          <Link href="/edit" aria-current={adding ? "page" : undefined}>
            Add a month
          </Link>
        </li>
        {ordered.map((pick) => {
          const label = pickLabel(pick);
          return (
            <li key={pick.id}>
              <Link
                href={`/edit?month=${encodeURIComponent(pick.month)}`}
                aria-current={pick.month === selectedMonth ? "page" : undefined}
              >
                {formatClubMonth(pick.month)}
                {label ? (
                  <>
                    {" — "}
                    {pick.kind === "prompt" ? <em>{label}</em> : label}
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function formValues(selected: PickRecord | null, monthForInput: string): PickFormValues {
  if (!selected) {
    return {
      monthLocked: false,
      month: monthForInput,
      monthLabel: "",
      kind: "book",
      title: "",
      author: "",
      publishedYear: "",
      pageCount: "",
      genre: "",
      coverUrl: "",
      promptText: "",
    };
  }

  return {
    monthLocked: true,
    month: selected.month,
    monthLabel: formatClubMonth(selected.month),
    kind: selected.kind,
    title: selected.kind === "book" ? (selected.title ?? "") : "",
    author: selected.kind === "book" ? (selected.author ?? "") : "",
    publishedYear: selected.publishedYear?.toString() ?? "",
    pageCount: selected.pageCount?.toString() ?? "",
    genre: selected.kind === "book" ? (selected.genre ?? "") : "",
    coverUrl: selected.kind === "book" ? (selected.coverUrl ?? "") : "",
    promptText: selected.kind === "prompt" ? (selected.promptText ?? "") : "",
  };
}

function pickLabel(pick: PickRecord): string {
  if (pick.kind === "prompt") return pick.promptText?.trim() ?? "";
  const title = pick.title?.trim() ?? "";
  const author = pick.author?.trim() ?? "";
  if (title && author) return `${title} by ${author}`;
  return title || author;
}

function noticeText(notice: EditorNotice): string {
  if (notice === "saved") return "Saved.";
  if (notice === "saved-without-cover") {
    return "Saved. The cover link was left off because it is not an Open Library cover.";
  }
  return "Deleted.";
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
