import { normalizeMonth } from "@/lib/validation";

export type EditorNotice = "saved" | "saved-without-cover" | "deleted" | "meeting";

export type EditorQuery = {
  month?: string | string[];
  saved?: string | string[];
  deleted?: string | string[];
  meeting?: string | string[];
};

export function readEditorQuery(query: EditorQuery): {
  selectedMonth: string | null;
  notice: EditorNotice | null;
} {
  const saved = firstQuery(query.saved);
  const deleted = firstQuery(query.deleted);
  const meeting = firstQuery(query.meeting);
  const notice: EditorNotice | null =
    saved === "cover"
      ? "saved-without-cover"
      : saved === "1"
        ? "saved"
        : deleted === "1"
          ? "deleted"
          : meeting === "1"
            ? "meeting"
            : null;

  return {
    selectedMonth: normalizeMonth(firstQuery(query.month)),
    notice,
  };
}

function firstQuery(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value.find((item) => item.length > 0);
    return first ?? null;
  }
  return null;
}
