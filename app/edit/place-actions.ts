"use server";

import { redirect } from "next/navigation";
import { RecordKeeperRequiredError } from "@/lib/record-keeper";
import { clearPlaceSelection, confirmPlaceSelection } from "@/lib/places/selection";
import { searchPlacesForRecordKeeper, type SignedPlaceCandidate } from "@/lib/places/lookup";

export type PlaceSearchFormState =
  | { status: "idle" }
  | { status: "matches"; candidates: SignedPlaceCandidate[] }
  | { status: "empty" | "missing" | "unconfigured" | "forbidden" | "unavailable"; message: string };

export type PlaceWriteFormState = {
  status: "idle" | "rejected" | "missing" | "forbidden" | "error";
  message?: string;
};

const SIGN_IN_REQUIRED = "You need to be signed in as the record keeper.";
const SEARCH_EMPTY = "No matches came back. The venue name is unchanged, and no pin was added.";
const SEARCH_MISSING = "Save a venue name for this month before looking up a place.";
const SEARCH_UNCONFIGURED = "Place search is not set up, so no places were looked up and no pin was added.";
const SEARCH_UNAVAILABLE = "Place search didn't respond. The venue name is unchanged, and no pin was added.";
const CONFIRM_REJECTED = "That match expired or was not one of the results. No pin was added. Search again and choose a result.";
const CONFIRM_MISSING = "Save a venue name for this month before confirming a place.";
const CONFIRM_FAILED = "The place could not be saved. No pin was added.";
const CLEAR_MISSING = "This month has no venue name to clear.";
const CLEAR_FAILED = "The confirmed place could not be cleared.";

export async function searchPlaceAction(_previous: PlaceSearchFormState, formData: FormData): Promise<PlaceSearchFormState> {
  const result = await searchPlacesForRecordKeeper({ month: formData.get("month") });
  if (result.status === "matches") return { status: "matches", candidates: result.candidates };
  if (result.status === "empty") return { status: "empty", message: SEARCH_EMPTY };
  if (result.status === "missing") return { status: "missing", message: SEARCH_MISSING };
  if (result.status === "unconfigured") return { status: "unconfigured", message: SEARCH_UNCONFIGURED };
  if (result.status === "forbidden") return { status: "forbidden", message: SIGN_IN_REQUIRED };
  return { status: "unavailable", message: SEARCH_UNAVAILABLE };
}

export async function confirmPlaceAction(
  _previous: PlaceWriteFormState,
  formData: FormData,
): Promise<PlaceWriteFormState> {
  const outcome = await runConfirm(formData);
  if (outcome.status === "saved") {
    await publishPlaceChange();
    redirect(`/edit?month=${encodeURIComponent(outcome.month)}&place=1`);
  }
  return outcome;
}

export async function clearPlaceAction(
  _previous: PlaceWriteFormState,
  formData: FormData,
): Promise<PlaceWriteFormState> {
  const outcome = await runClear(formData);
  if (outcome.status === "cleared") {
    await publishPlaceChange();
    redirect(`/edit?month=${encodeURIComponent(outcome.month)}&place=cleared`);
  }
  return outcome;
}

async function runConfirm(formData: FormData): Promise<{ status: "saved"; month: string } | PlaceWriteFormState> {
  try {
    const result = await confirmPlaceSelection({
      month: formData.get("month"),
      token: formData.get("candidate"),
    });
    if (result.status === "saved") return { status: "saved", month: result.month };
    if (result.status === "rejected") return { status: "rejected", message: CONFIRM_REJECTED };
    if (result.status === "missing") return { status: "missing", message: CONFIRM_MISSING };
    return { status: "error", message: CONFIRM_FAILED };
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) return { status: "forbidden", message: SIGN_IN_REQUIRED };
    throw error;
  }
}

async function runClear(formData: FormData): Promise<{ status: "cleared"; month: string } | PlaceWriteFormState> {
  try {
    const result = await clearPlaceSelection({ month: formData.get("month") });
    if (result.status === "cleared") return { status: "cleared", month: result.month };
    if (result.status === "missing") return { status: "missing", message: CLEAR_MISSING };
    return { status: "error", message: CLEAR_FAILED };
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) return { status: "forbidden", message: SIGN_IN_REQUIRED };
    throw error;
  }
}

async function publishPlaceChange(): Promise<void> {
  try {
    const { refresh, revalidatePath } = await import("next/cache");
    revalidatePath("/edit");
    refresh();
  } catch {
    console.error("refreshing after a place change failed");
  }
}
