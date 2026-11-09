"use client";

import { useActionState, useRef, useState } from "react";
import { fieldsFromMatch } from "@/lib/books/match";
import { PICK_TEXT_LIMITS } from "@/lib/validation";
import { BookSearch } from "./book-search";
import { deleteMonthPick, saveMonthPick, type DeleteFormState, type PickFormState } from "./pick-actions";

export type PickFormValues = {
  monthLocked: boolean;
  month: string;
  monthLabel: string;
  kind: "book" | "prompt";
  title: string;
  author: string;
  publishedYear: string;
  pageCount: string;
  genre: string;
  coverUrl: string;
  promptText: string;
  lookupSource: "manual" | "open_library";
  lookupKey: string;
};

const idleSave: PickFormState = { status: "idle" };
const idleDelete: DeleteFormState = { status: "idle" };

export function PickForm({ values }: { values: PickFormValues }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(saveMonthPick, idleSave);
  const [kind, setKind] = useState(values.kind);
  const [book, setBook] = useState({
    title: values.title,
    author: values.author,
    publishedYear: values.publishedYear,
    pageCount: values.pageCount,
    genre: values.genre,
    coverUrl: values.coverUrl,
    lookupSource: values.lookupSource,
    lookupKey: values.lookupKey,
  });
  const errors = state.errors ?? {};

  return (
    <form ref={formRef} className="edit-form pick-form" action={action} autoComplete="off">
      {state.status === "invalid" ? (
        <p id="pick-form-error" role="alert">
          This month needs a correction before it can be saved.
        </p>
      ) : null}
      {state.status === "forbidden" || state.status === "error" ? (
        <p role="alert">{state.message}</p>
      ) : null}

      {values.monthLocked ? (
        <p className="locked-month">
          <span className="field-label">Month</span>
          {values.monthLabel}
          <input type="hidden" name="month" value={values.month} />
        </p>
      ) : (
        <>
          <label htmlFor="pick-month">Month</label>
          <input
            id="pick-month"
            name="month"
            type="month"
            required
            defaultValue={values.month}
            aria-invalid={errors.month ? true : undefined}
            aria-describedby={errors.month ? "pick-month-error" : undefined}
          />
          <FieldError id="pick-month-error" message={errors.month} />
        </>
      )}

      <fieldset
        className="kind-choice"
        aria-invalid={errors.kind ? true : undefined}
        aria-describedby={errors.kind ? "pick-kind-error" : undefined}
      >
        <legend>Book or prompt</legend>
        <label>
          <input
            type="radio"
            name="kind"
            value="book"
            checked={kind === "book"}
            required
            onChange={() => setKind("book")}
          />
          Book
        </label>
        <label>
          <input type="radio" name="kind" value="prompt" checked={kind === "prompt"} onChange={() => setKind("prompt")} />
          Prompt
        </label>
        <FieldError id="pick-kind-error" message={errors.kind} />
      </fieldset>

      <div className="for-book">
        {kind === "book" ? (
          <BookSearch
            getKind={() => (formRef.current ? selectedKind(formRef.current) : kind)}
            onApply={(match) => {
              const applied = fieldsFromMatch(match);
              if (!applied || selectedKind(formRef.current) !== "book") return;
              setBook(applied);
            }}
          />
        ) : null}
        <input type="hidden" name="lookupSource" value={book.lookupSource} />
        <input type="hidden" name="lookupKey" value={book.lookupKey} />
        <TextField
          id="pick-title"
          name="title"
          label="Title"
          value={book.title}
          onValueChange={(title) => setBook((current) => ({ ...current, title }))}
          maxLength={PICK_TEXT_LIMITS.title}
          error={errors.title}
        />
        <TextField
          id="pick-author"
          name="author"
          label="Author"
          value={book.author}
          onValueChange={(author) => setBook((current) => ({ ...current, author }))}
          maxLength={PICK_TEXT_LIMITS.author}
          error={errors.author}
        />
        <TextField
          id="pick-year"
          name="publishedYear"
          label="Publication year"
          value={book.publishedYear}
          onValueChange={(publishedYear) => setBook((current) => ({ ...current, publishedYear }))}
          inputMode="numeric"
          error={errors.publishedYear}
          optional
        />
        <TextField
          id="pick-pages"
          name="pageCount"
          label="Page count"
          value={book.pageCount}
          onValueChange={(pageCount) => setBook((current) => ({ ...current, pageCount }))}
          inputMode="numeric"
          error={errors.pageCount}
          optional
        />
        <TextField
          id="pick-genre"
          name="genre"
          label="Genre"
          value={book.genre}
          onValueChange={(genre) => setBook((current) => ({ ...current, genre }))}
          maxLength={PICK_TEXT_LIMITS.genre}
          error={errors.genre}
          optional
        />
        <TextField
          id="pick-cover"
          name="coverUrl"
          label="Cover link"
          value={book.coverUrl}
          onValueChange={(coverUrl) => setBook((current) => ({ ...current, coverUrl }))}
          maxLength={PICK_TEXT_LIMITS.cover}
          error={errors.coverUrl}
          hint="Optional. Only an Open Library cover link is kept."
          spellCheck={false}
          optional
        />
      </div>

      <div className="for-prompt">
        <label htmlFor="pick-prompt">Prompt</label>
        <textarea
          id="pick-prompt"
          name="promptText"
          rows={6}
          maxLength={PICK_TEXT_LIMITS.prompt}
          defaultValue={values.promptText}
          aria-invalid={errors.promptText ? true : undefined}
          aria-describedby={errors.promptText ? "pick-prompt-error" : undefined}
        />
        <FieldError id="pick-prompt-error" message={errors.promptText} />
      </div>

      <button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save month"}
      </button>
    </form>
  );
}

export function DeletePickForm({ month }: { month: string }) {
  const [state, action, pending] = useActionState(deleteMonthPick, idleDelete);

  return (
    <form className="edit-form" action={action}>
      <p className="edit-note">Remove this month from the club&apos;s page.</p>
      <input type="hidden" name="month" value={month} />
      <button type="submit" className="danger" disabled={pending}>
        {pending ? "Deleting..." : "Delete this month"}
      </button>
      {state.message ? <p role="alert">{state.message}</p> : null}
    </form>
  );
}

function selectedKind(form: HTMLFormElement | null): "book" | "prompt" {
  if (!form) return "book";
  const value = new FormData(form).get("kind");
  return value === "prompt" ? "prompt" : "book";
}

function TextField({
  id,
  name,
  label,
  value,
  onValueChange,
  maxLength,
  error,
  hint,
  inputMode,
  spellCheck,
  optional = false,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  maxLength?: number;
  error?: string;
  hint?: string;
  inputMode?: "numeric" | "url";
  spellCheck?: boolean;
  optional?: boolean;
}) {
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [hintId, errorId].filter((item) => item !== null).join(" ");

  return (
    <>
      <label htmlFor={id}>
        {label}
        {optional ? <span className="hint"> (optional)</span> : null}
      </label>
      <input
        id={id}
        name={name}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        maxLength={maxLength}
        inputMode={inputMode}
        spellCheck={spellCheck}
        autoCapitalize={spellCheck === false ? "none" : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
      {hint ? (
        <p id={hintId ?? undefined} className="hint">
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId ?? `${id}-error`} message={error} />
    </>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="field-error">
      {message}
    </p>
  );
}
