"use client";

import { useActionState } from "react";
import { PLACE_LIMIT } from "@/lib/meeting-copy";
import { saveVenueNameAction, type VenueFormState } from "./venue-actions";

export type VenueFormValues = {
  month: string;
  enteredName: string;
  fromMeeting: boolean;
};

const idle: VenueFormState = { status: "idle" };

export function VenueForm({ values }: { values: VenueFormValues }) {
  const [state, action, pending] = useActionState(saveVenueNameAction, idle);
  const errors = state.errors ?? {};
  const hint = values.fromMeeting
    ? "The next meeting's place is filled in. You can type a different name. Saving it does not change the meeting, and this is not a map pin."
    : "Where this month met. Saving it does not change the next meeting, and this is not a map pin.";

  return (
    <form className="edit-form venue-form" action={action} autoComplete="off">
      <h4 className="venue-heading">Venue</h4>
      {state.status === "invalid" ? (
        <p id="venue-form-error" role="alert">
          The venue name needs a correction before it can be saved.
        </p>
      ) : null}
      {state.status === "missing" || state.status === "forbidden" || state.status === "error" ? (
        <p role="alert">{state.message}</p>
      ) : null}

      <label htmlFor="venue-name">Venue name</label>
      <input
        id="venue-name"
        name="enteredName"
        type="text"
        required
        maxLength={PLACE_LIMIT}
        defaultValue={values.enteredName}
        autoComplete="off"
        aria-invalid={errors.enteredName ? true : undefined}
        aria-describedby={errors.enteredName ? "venue-name-error venue-name-hint" : "venue-name-hint"}
      />
      <p id="venue-name-hint" className="hint">
        {hint}
      </p>
      <FieldError id="venue-name-error" message={errors.enteredName} />
      <input type="hidden" name="month" value={values.month} />
      {errors.month ? <p role="alert">{errors.month}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save venue name"}
      </button>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="field-error">
      {message}
    </p>
  );
}
