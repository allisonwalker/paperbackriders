"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent } from "react";
import { formatClubMonth } from "@/lib/club-date";
import type { EditAccess } from "@/lib/edit-access";
import type { EditorMeetingState } from "@/lib/meeting";
import { meetingFormValues } from "@/lib/meeting-input";
import type { EditorPicksState, PickRecord } from "@/lib/picks";
import { monthInputValue, storedBookLookup } from "@/lib/validation";
import type { VenueNameState } from "@/lib/visit-records";
import {
  editorQueryFromSearch,
  MEETING_TAB_HREF,
  noticeForTab,
  picksTabHref,
  readEditorQuery,
  type EditorNotice,
  type EditorTab,
} from "./editor-query";
import { signOutRecordKeeper } from "./actions";
import { MeetingForm, type MeetingChoice } from "./meeting-form";
import { PlaceFinder } from "./place-form";
import { DeletePickForm, PickForm, type PickFormValues } from "./pick-form";
import { SignInForm } from "./sign-in-form";
import { VenueForm, type VenueFormValues } from "./venue-form";

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
      today: string;
      currentMonth: string;
      meeting: EditorMeetingState;
      venue: VenueNameState | null;
      tab?: EditorTab;
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

function editorViewKey(tab: EditorTab, notice: EditorNotice | null, month: string | null): string {
  return `${tab}:${notice ?? ""}:${month ?? ""}`;
}

function EditorBody(props: EditScreenProps) {
  if (!isSignedIn(props)) {
    return props.access.status === "unavailable" ? <Unavailable /> : <SignedOut />;
  }

  const tab = props.tab ?? "picks";
  return (
    <SignedIn
      key={editorViewKey(tab, props.notice, props.selectedMonth)}
      email={props.access.email}
      records={props.records}
      selectedMonth={props.selectedMonth}
      notice={props.notice}
      defaultMonth={props.defaultMonth}
      today={props.today}
      currentMonth={props.currentMonth}
      meeting={props.meeting}
      venue={props.venue}
      tab={tab}
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
  notice: initialNotice,
  defaultMonth,
  today,
  currentMonth,
  meeting,
  venue,
  tab: initialTab,
}: {
  email: string;
  records: EditorPicksState;
  selectedMonth: string | null;
  notice: EditorNotice | null;
  defaultMonth: string;
  today: string;
  currentMonth: string;
  meeting: EditorMeetingState;
  venue: VenueNameState | null;
  tab: EditorTab;
}) {
  const [view, setView] = useState({ tab: initialTab, notice: initialNotice });
  const tab = view.tab;
  const notice = noticeForTab(tab, view.notice);
  const selected =
    records.status === "ready" && selectedMonth
      ? (records.picks.find((pick) => pick.month === selectedMonth) ?? null)
      : null;
  const monthForInput = selected
    ? monthInputValue(selected.month)
    : selectedMonth
      ? monthInputValue(selectedMonth)
      : defaultMonth;

  useEffect(() => {
    function onPop() {
      if (window.location.pathname !== "/edit") return;
      const next = readEditorQuery(editorQueryFromSearch(window.location.search));
      setView({ tab: next.tab, notice: next.notice });
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function chooseTab(event: MouseEvent<HTMLAnchorElement>, next: EditorTab) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const nextUrl = new URL(event.currentTarget.href);
    const target = `${nextUrl.pathname}${nextUrl.search}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next === tab && notice === null && current === target) return;
    const historyState = window.history.state;
    if (historyState && (historyState.__NA || historyState._N)) {
      window.history.pushState(historyState, "", target);
    } else {
      window.history.pushState(null, "", target);
    }
    setView({ tab: next, notice: null });
  }

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
      <nav className="record-tabs" aria-label="Record keeping">
        <a
          href={picksTabHref(selectedMonth)}
          aria-current={tab === "picks" ? "page" : undefined}
          onClick={(event) => chooseTab(event, "picks")}
        >
          Picks
        </a>
        <a
          href={MEETING_TAB_HREF}
          aria-current={tab === "meeting" ? "page" : undefined}
          onClick={(event) => chooseTab(event, "meeting")}
        >
          Next meeting
        </a>
      </nav>
      {tab === "meeting" ? (
        <MeetingSection
          records={records}
          meeting={meeting}
          today={today}
          currentMonth={currentMonth}
          returnMonth={selected?.month ?? null}
          notice={notice}
        />
      ) : (
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
          {selected ? (
            <VenueSection key={`venue-${selected.id}`} month={selected.month} venue={venue} meeting={meeting} />
          ) : null}
          {selected ? <DeletePickForm key={`delete-${selected.id}`} month={selected.month} /> : null}
        </div>
      )}
    </>
  );
}

function VenueSection({
  month,
  venue,
  meeting,
}: {
  month: string;
  venue: VenueNameState | null;
  meeting: EditorMeetingState;
}) {
  if (!venue || venue.status === "error") {
    return <p role="alert">The venue name could not be loaded.</p>;
  }

  const values = venueFormValues(month, venue.enteredName, venue.placeLabel, meeting);
  const savedName = venue.enteredName?.trim() ?? "";
  return (
    <>
      <VenueForm key={`${month}-${values.enteredName}`} values={values} />
      {savedName ? <PlaceFinder month={month} placeLabel={venue.placeLabel} /> : null}
    </>
  );
}

function venueFormValues(
  month: string,
  enteredName: string | null,
  placeLabel: string | null,
  meeting: EditorMeetingState,
): VenueFormValues {
  if (enteredName) return { month, enteredName, fromMeeting: false, placeConfirmed: placeLabel !== null };
  if (meeting.status === "set") return { month, enteredName: meeting.place, fromMeeting: true, placeConfirmed: false };
  return { month, enteredName: "", fromMeeting: false, placeConfirmed: false };
}

function MeetingSection({
  records,
  meeting,
  today,
  currentMonth,
  returnMonth,
  notice,
}: {
  records: EditorPicksState;
  meeting: EditorMeetingState;
  today: string;
  currentMonth: string;
  returnMonth: string | null;
  notice: EditorNotice | null;
}) {
  return (
    <div className="editor-pick">
      <h3 className="edit-heading">Next meeting</h3>
      {notice === "meeting" ? <p role="status">The next meeting is saved.</p> : null}
      <MeetingBody records={records} meeting={meeting} today={today} currentMonth={currentMonth} returnMonth={returnMonth} />
    </div>
  );
}

function MeetingBody({
  records,
  meeting,
  today,
  currentMonth,
  returnMonth,
}: {
  records: EditorPicksState;
  meeting: EditorMeetingState;
  today: string;
  currentMonth: string;
  returnMonth: string | null;
}) {
  if (meeting.status === "error") {
    return <p role="alert">The meeting could not be loaded.</p>;
  }
  if (records.status === "error") {
    return <p role="alert">The meeting cannot be saved until the months load.</p>;
  }
  if (records.picks.length === 0) {
    return <p>Save a month&apos;s pick before setting the meeting.</p>;
  }

  const values = meetingFormValues({
    picks: records.picks,
    stored: meeting.status === "set" ? meeting : null,
    today,
    currentMonth,
  });

  return (
    <MeetingForm
      values={{
        date: values.date,
        time: values.time,
        place: values.place,
        pickId: values.pickId,
        returnMonth,
        choices: meetingChoices(records.picks),
      }}
    />
  );
}

function meetingChoices(picks: PickRecord[]): MeetingChoice[] {
  return [...picks]
    .sort((left, right) => (left.month < right.month ? 1 : left.month > right.month ? -1 : 0))
    .map((pick) => ({ id: pick.id, label: choiceLabel(pick) }));
}

function choiceLabel(pick: PickRecord): string {
  const month = formatClubMonth(pick.month);
  const detail = pickLabel(pick);
  return detail ? `${month} — ${detail}` : month;
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
      lookupSource: "manual",
      lookupKey: "",
    };
  }

  const lookup =
    selected.kind === "book" ? storedBookLookup(selected.lookupSource, selected.lookupKey) : storedBookLookup(null, null);

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
    lookupSource: lookup.lookupSource,
    lookupKey: lookup.lookupKey,
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
  if (notice === "venue") return "Venue name saved.";
  if (notice === "place") return "Place confirmed. Anyone with the link can see this pin.";
  if (notice === "place-cleared") return "Confirmed place cleared. The venue name is still saved, and there is no pin.";
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
