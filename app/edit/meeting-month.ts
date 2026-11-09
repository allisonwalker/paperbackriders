import type { EditorMeetingState } from "@/lib/meeting";
import type { EditorPicksState } from "@/lib/picks";

export function meetingPickMonth(records: EditorPicksState, meeting: EditorMeetingState): string | null {
  if (meeting.status !== "set" || records.status !== "ready") return null;
  return records.picks.find((pick) => pick.id === meeting.pickId)?.month ?? null;
}
