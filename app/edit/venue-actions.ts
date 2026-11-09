"use server";

import { redirect } from "next/navigation";
import { saveVenueName, type VenueNameErrors } from "@/lib/visit-records";
import { RecordKeeperRequiredError } from "@/lib/record-keeper";

export type VenueFormState = {
  status: "idle" | "invalid" | "missing" | "forbidden" | "error";
  message?: string;
  errors?: VenueNameErrors;
};

const SIGN_IN_REQUIRED = "You need to be signed in as the record keeper.";
const SAVE_FAILED = "The venue name could not be saved.";

export async function saveVenueNameAction(
  _previous: VenueFormState,
  formData: FormData,
): Promise<VenueFormState> {
  const outcome = await runSave(formData);
  if (outcome.status === "saved") {
    await publishVenueChange();
    redirect(`/edit?month=${encodeURIComponent(outcome.month)}&venue=1`);
  }
  return outcome;
}

async function runSave(formData: FormData): Promise<{ status: "saved"; month: string } | VenueFormState> {
  try {
    const result = await saveVenueName({
      month: formData.get("month"),
      enteredName: formData.get("enteredName"),
    });
    if (result.status === "saved") return { status: "saved", month: result.month };
    if (result.status === "invalid") return { status: "invalid", errors: result.errors };
    if (result.status === "missing") return { status: "missing", message: result.message };
    return { status: "error", message: SAVE_FAILED };
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) {
      return { status: "forbidden", message: SIGN_IN_REQUIRED };
    }
    throw error;
  }
}

async function publishVenueChange(): Promise<void> {
  try {
    const { refresh, revalidatePath } = await import("next/cache");
    revalidatePath("/edit");
    refresh();
  } catch {
    console.error("refreshing after a venue name change failed");
  }
}
