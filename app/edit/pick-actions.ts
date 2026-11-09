"use server";

import { redirect } from "next/navigation";
import { deletePick, savePick } from "@/lib/pick-records";
import { RecordKeeperRequiredError } from "@/lib/record-keeper";
import { pickInputFromForm, type FieldErrors, type PickInput } from "@/lib/validation";

export type PickFormState = {
  status: "idle" | "invalid" | "forbidden" | "error";
  message?: string;
  errors?: FieldErrors;
};

export type DeleteFormState = {
  status: "idle" | "blocked" | "missing" | "forbidden" | "invalid" | "error";
  message?: string;
};

const SIGN_IN_REQUIRED = "You need to be signed in as the record keeper.";
const SAVE_FAILED = "That month could not be saved.";

export async function saveMonthPick(_previous: PickFormState, formData: FormData): Promise<PickFormState> {
  const outcome = await runSave(pickInputFromForm(formData));
  if (outcome.status === "saved") {
    await publishRecordChange();
    redirect(`/edit?month=${encodeURIComponent(outcome.month)}&saved=${outcome.coverDropped ? "cover" : "1"}`);
  }
  return outcome;
}

export async function deleteMonthPick(_previous: DeleteFormState, formData: FormData): Promise<DeleteFormState> {
  const outcome = await runDelete(formData.get("month"));
  if (outcome.status === "deleted") {
    await publishRecordChange();
    redirect("/edit?deleted=1");
  }
  return { status: outcome.status, message: outcome.message };
}

async function runSave(input: PickInput): Promise<
  | { status: "saved"; month: string; coverDropped: boolean }
  | PickFormState
> {
  try {
    const result = await savePick(input);
    if (result.status === "saved") {
      return { status: "saved", month: result.month, coverDropped: result.coverDropped };
    }
    if (result.status === "invalid") return { status: "invalid", errors: result.errors };
    return { status: "error", message: SAVE_FAILED };
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) {
      return { status: "forbidden", message: SIGN_IN_REQUIRED };
    }
    throw error;
  }
}

async function runDelete(month: FormDataEntryValue | null): Promise<
  | { status: "deleted" }
  | DeleteFormState
> {
  try {
    const result = await deletePick({ month: typeof month === "string" ? month : "" });
    if (result.status === "deleted") return { status: "deleted" };
    return { status: result.status, message: result.message };
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) {
      return { status: "forbidden", message: SIGN_IN_REQUIRED };
    }
    throw error;
  }
}

async function publishRecordChange(): Promise<void> {
  try {
    const { refresh, revalidatePath } = await import("next/cache");
    revalidatePath("/");
    revalidatePath("/edit");
    refresh();
  } catch {
    console.error("refreshing after a pick change failed");
  }
}
