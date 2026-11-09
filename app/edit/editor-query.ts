import { normalizeMonth } from "@/lib/validation";

export type EditorNotice =
  | "saved"
  | "saved-without-cover"
  | "deleted"
  | "meeting"
  | "venue"
  | "place"
  | "place-cleared";

export type EditorTab = "picks" | "meeting";

export type EditorQuery = {
  month?: string | string[];
  saved?: string | string[];
  deleted?: string | string[];
  meeting?: string | string[];
  venue?: string | string[];
  place?: string | string[];
  tab?: string | string[];
};

export const MEETING_TAB_HREF = "/edit?tab=meeting";

export function readEditorQuery(query: EditorQuery): {
  selectedMonth: string | null;
  notice: EditorNotice | null;
  tab: EditorTab;
} {
  const tab = editorTab(firstQuery(query.tab));
  return {
    selectedMonth: normalizeMonth(firstQuery(query.month)),
    notice: noticeForTab(tab, rawNotice(query)),
    tab,
  };
}

export function editorTab(value: string | null): EditorTab {
  return value === "meeting" ? "meeting" : "picks";
}

export function noticeForTab(tab: EditorTab, notice: EditorNotice | null): EditorNotice | null {
  if (notice === null) return null;
  const onMeeting = notice === "meeting" || notice === "place" || notice === "place-cleared";
  if (tab === "meeting") return onMeeting ? notice : null;
  return onMeeting ? null : notice;
}

export function picksTabHref(month: string | null): string {
  if (!month) return "/edit";
  return `/edit?month=${encodeURIComponent(month)}`;
}

export function editorQueryFromSearch(search: string): EditorQuery {
  const params = new URLSearchParams(search);
  const query: EditorQuery = {};
  for (const key of ["month", "saved", "deleted", "meeting", "venue", "place", "tab"] as const) {
    const value = params.get(key);
    if (value !== null) query[key] = value;
  }
  return query;
}

function rawNotice(query: EditorQuery): EditorNotice | null {
  const saved = firstQuery(query.saved);
  const deleted = firstQuery(query.deleted);
  const meeting = firstQuery(query.meeting);
  const venue = firstQuery(query.venue);
  const place = firstQuery(query.place);
  if (saved === "cover") return "saved-without-cover";
  if (saved === "1") return "saved";
  if (deleted === "1") return "deleted";
  if (meeting === "1") return "meeting";
  if (venue === "1") return "venue";
  if (place === "1") return "place";
  if (place === "cleared") return "place-cleared";
  return null;
}

function firstQuery(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value.find((item) => item.length > 0);
    return first ?? null;
  }
  return null;
}
