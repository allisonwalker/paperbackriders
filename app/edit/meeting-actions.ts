"use server";

import { redirect } from "next/navigation";
import { saveMeeting } from "@/lib/meeting-records";
import { meetingInputFromForm, meetingSavedHref, type MeetingErrors } from "@/lib/meeting-input";
import { RecordKeeperRequiredError } from "@/lib/record-keeper";

export type MeetingFormState = {
  status: "idle" | "invalid" | "forbidden" | "error";
  message?: string;
  errors?: MeetingErrors;
};

const SIGN_IN_REQUIRED = "You need to be signed in as the record keeper.";
const SAVE_FAILED = "The meeting could not be saved.";

export async function saveNextMeeting(_previous: MeetingFormState, formData: FormData): Promise<MeetingFormState> {
  const outcome = await runSave(formData);
  if (outcome.status === "saved") {
    await publishMeetingChange();
    redirect(meetingSavedHref(formData.get("returnMonth")));
  }
  return outcome;
}

async function runSave(formData: FormData): Promise<{ status: "saved" } | MeetingFormState> {
  try {
    const result = await saveMeeting(meetingInputFromForm(formData));
    if (result.status === "saved") return { status: "saved" };
    if (result.status === "invalid") return { status: "invalid", errors: result.errors };
    return { status: "error", message: SAVE_FAILED };
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) {
      return { status: "forbidden", message: SIGN_IN_REQUIRED };
    }
    throw error;
  }
}

async function publishMeetingChange(): Promise<void> {
  try {
    const { refresh, revalidatePath } = await import("next/cache");
    revalidatePath("/");
    revalidatePath("/edit");
    refresh();
  } catch {
    console.error("refreshing after a meeting change failed");
  }
}
