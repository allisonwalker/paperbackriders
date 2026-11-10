"use client";

import { useActionState, useState } from "react";
import { PLACE_IS_PUBLIC, PLACE_LIMIT } from "@/lib/meeting-copy";
import { saveNextMeeting, type MeetingFormState } from "./meeting-actions";

export type MeetingChoice = {
  id: string;
  label: string;
};

export type MeetingFormValues = {
  date: string;
  time: string;
  place: string;
  pickId: string | null;
  returnMonth: string | null;
  choices: MeetingChoice[];
};

const idle: MeetingFormState = { status: "idle" };

export function MeetingForm({ values }: { values: MeetingFormValues }) {
  const [state, action, pending] = useActionState(saveNextMeeting, idle);
  const [pickId, setPickId] = useState(values.pickId ?? "");
  const errors = state.errors ?? {};
  const placeDescribedBy = ["place-public", errors.place ? "meeting-place-error" : null].filter(Boolean).join(" ");

  return (
    <form className="edit-form meeting-form" action={action} autoComplete="off">
      {state.status === "invalid" ? (
        <p id="meeting-form-error" role="alert">
          The meeting needs a correction before it can be saved.
        </p>
      ) : null}
      {state.status === "forbidden" || state.status === "error" ? <p role="alert">{state.message}</p> : null}

      <label htmlFor="meeting-pick">Pick</label>
      <select
        id="meeting-pick"
        name="pickId"
        required
        value={pickId}
        onChange={(event) => setPickId(event.target.value)}
        aria-invalid={errors.pick ? true : undefined}
        aria-describedby={errors.pick ? "meeting-pick-error" : undefined}
      >
        {values.pickId ? null : <option value="">Choose a pick</option>}
        {values.choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}
          </option>
        ))}
      </select>
      <FieldError id="meeting-pick-error" message={errors.pick} />

      <label htmlFor="meeting-date">Date</label>
      <input
        id="meeting-date"
        name="date"
        type="date"
        required
        defaultValue={values.date}
        aria-invalid={errors.date ? true : undefined}
        aria-describedby={errors.date ? "meeting-date-error" : undefined}
      />
      <FieldError id="meeting-date-error" message={errors.date} />

      <label htmlFor="meeting-time">Time</label>
      <input
        id="meeting-time"
        name="time"
        type="time"
        required
        defaultValue={values.time}
        aria-invalid={errors.time ? true : undefined}
        aria-describedby={errors.time ? "meeting-time-error" : undefined}
      />
      <FieldError id="meeting-time-error" message={errors.time} />

      <label htmlFor="meeting-place">Place</label>
      <input
        id="meeting-place"
        name="place"
        type="text"
        required
        maxLength={PLACE_LIMIT}
        defaultValue={values.place}
        autoComplete="off"
        aria-invalid={errors.place ? true : undefined}
        aria-describedby={placeDescribedBy}
      />
      <p id="place-public" className="hint">
        {PLACE_IS_PUBLIC}
      </p>
      <FieldError id="meeting-place-error" message={errors.place} />

      {values.returnMonth ? <input type="hidden" name="returnMonth" value={values.returnMonth} /> : null}

      <button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save meeting"}
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
