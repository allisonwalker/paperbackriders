"use client";

import { useActionState } from "react";
import {
  clearPlaceAction,
  confirmPlaceAction,
  searchPlaceAction,
  type PlaceSearchFormState,
  type PlaceWriteFormState,
} from "./place-actions";

const PIN_IS_PUBLIC =
  "A confirmed pin is public. Anyone with the link will see this exact place. Choose a public bar, park, or similar. You can leave the venue unresolved.";

const idleSearch: PlaceSearchFormState = { status: "idle" };
const idleWrite: PlaceWriteFormState = { status: "idle" };

export function PlaceFinder({ month, placeLabel }: { month: string; placeLabel: string | null }) {
  const [searchState, search, searching] = useActionState(searchPlaceAction, idleSearch);
  const [confirmState, confirm, confirming] = useActionState(confirmPlaceAction, idleWrite);
  const [clearState, clear, clearing] = useActionState(clearPlaceAction, idleWrite);
  const busy = searching || confirming || clearing;

  return (
    <div className="place-finder">
      <h4>Real place</h4>
      {placeLabel ? <p>Confirmed place: {placeLabel}</p> : <p>No place is confirmed for this month.</p>}
      <p id="place-public-warning" className="hint">
        {PIN_IS_PUBLIC}
      </p>
      <p className="place-attribution">
        <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer noopener">
          Powered by Geoapify
        </a>
        {" · "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">
          © OpenStreetMap contributors
        </a>
      </p>

      <form className="edit-form" action={search} autoComplete="off">
        <input type="hidden" name="month" value={month} />
        <button type="submit" disabled={busy}>
          {searching ? "Searching..." : "Find this place"}
        </button>
      </form>
      {searching ? <p role="status">Searching for places...</p> : null}
      <SearchResult state={searchState} />

      {searchState.status === "matches" ? (
        <form className="edit-form" action={confirm} autoComplete="off">
          <input type="hidden" name="month" value={month} />
          <PlaceMatchList candidates={searchState.candidates} />
          <button type="submit" disabled={busy}>
            {confirming ? "Confirming..." : "Confirm this place"}
          </button>
          {confirmState.status === "idle" ? null : <p role="alert">{confirmState.message}</p>}
        </form>
      ) : null}

      {placeLabel ? (
        <form className="edit-form" action={clear} autoComplete="off">
          <input type="hidden" name="month" value={month} />
          <button type="submit" className="secondary" disabled={busy}>
            {clearing ? "Clearing..." : "Clear confirmed place"}
          </button>
          {clearState.status === "idle" ? null : <p role="alert">{clearState.message}</p>}
        </form>
      ) : null}
    </div>
  );
}

export function PlaceMatchList({ candidates }: { candidates: { token: string; label: string }[] }) {
  return (
    <fieldset className="place-matches" aria-describedby="place-public-warning">
      <legend>
        {candidates.length === 1
          ? "1 match. Choose it to confirm the pin. Nothing is selected for you."
          : `${candidates.length} matches. Choose one to confirm the pin. Nothing is selected for you.`}
      </legend>
      {candidates.map((candidate) => (
        <label key={candidate.token}>
          <input type="radio" name="candidate" value={candidate.token} required />
          <span>{candidate.label}</span>
        </label>
      ))}
      <p className="hint">No pin is saved until you choose a match and confirm it.</p>
    </fieldset>
  );
}

function SearchResult({ state }: { state: PlaceSearchFormState }) {
  if (state.status === "idle" || state.status === "matches") return null;
  const role = state.status === "empty" ? "status" : "alert";
  return <p role={role}>{state.message}</p>;
}
