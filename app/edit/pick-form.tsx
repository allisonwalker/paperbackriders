"use client";

import { useActionState } from "react";
import { PICK_TEXT_LIMITS } from "@/lib/validation";
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
};

const idleSave: PickFormState = { status: "idle" };
const idleDelete: DeleteFormState = { status: "idle" };

export function PickForm({ values }: { values: PickFormValues }) {
  const [state, action, pending] = useActionState(saveMonthPick, idleSave);
  const errors = state.errors ?? {};

  return (
    <form className="edit-form pick-form" action={action} autoComplete="off">
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
          <input type="radio" name="kind" value="book" defaultChecked={values.kind === "book"} required />
          Book
        </label>
        <label>
          <input type="radio" name="kind" value="prompt" defaultChecked={values.kind === "prompt"} />
          Prompt
        </label>
        <FieldError id="pick-kind-error" message={errors.kind} />
      </fieldset>

      <div className="for-book">
        <TextField
          id="pick-title"
          name="title"
          label="Title"
          defaultValue={values.title}
          maxLength={PICK_TEXT_LIMITS.title}
          error={errors.title}
        />
        <TextField
          id="pick-author"
          name="author"
          label="Author"
          defaultValue={values.author}
          maxLength={PICK_TEXT_LIMITS.author}
          error={errors.author}
        />
        <TextField
          id="pick-year"
          name="publishedYear"
          label="Publication year"
          defaultValue={values.publishedYear}
          inputMode="numeric"
          error={errors.publishedYear}
          optional
        />
        <TextField
          id="pick-pages"
          name="pageCount"
          label="Page count"
          defaultValue={values.pageCount}
          inputMode="numeric"
          error={errors.pageCount}
          optional
        />
        <TextField
          id="pick-genre"
          name="genre"
          label="Genre"
          defaultValue={values.genre}
          maxLength={PICK_TEXT_LIMITS.genre}
          error={errors.genre}
          optional
        />
        <TextField
          id="pick-cover"
          name="coverUrl"
          label="Cover link"
          defaultValue={values.coverUrl}
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

function TextField({
  id,
  name,
  label,
  defaultValue,
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
  defaultValue: string;
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
        defaultValue={defaultValue}
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
