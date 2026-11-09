import { connection } from "next/server";
import { loadNextMeeting } from "@/lib/meeting";
import { loadFeaturedPick, loadHistory, type HistoryState } from "@/lib/picks";
import { PublicPage } from "./public-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page() {
  await connection();
  const featured = await loadFeaturedPick();
  if (featured.status === "error") {
    return <PublicPage featured={featured} meeting={{ status: "none" }} history={failedHistory} />;
  }

  const meeting = await loadNextMeeting();
  if (meeting.status === "error") {
    return <PublicPage featured={{ status: "error" }} meeting={{ status: "none" }} history={failedHistory} />;
  }

  const history = await loadHistory({
    markedMonth: featured.status === "ready" ? featured.month : null,
  });
  if (history.status === "error") {
    return <PublicPage featured={{ status: "error" }} meeting={{ status: "none" }} history={history} />;
  }

  return <PublicPage featured={featured} meeting={meeting} history={history} />;
}

const failedHistory: HistoryState = { status: "error" };
