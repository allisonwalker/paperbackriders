import { connection } from "next/server";
import { loadNextMeeting } from "@/lib/meeting";
import { loadFeaturedPick } from "@/lib/picks";
import { PublicPage } from "./public-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page() {
  await connection();
  const featured = await loadFeaturedPick();
  if (featured.status === "error") {
    return <PublicPage featured={featured} meeting={{ status: "none" }} />;
  }

  const meeting = await loadNextMeeting();
  if (meeting.status === "error") {
    return <PublicPage featured={{ status: "error" }} meeting={{ status: "none" }} />;
  }

  return <PublicPage featured={featured} meeting={meeting} />;
}
