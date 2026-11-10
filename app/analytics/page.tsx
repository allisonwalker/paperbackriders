import { connection } from "next/server";
import { loadReadingTotals } from "@/lib/reading";
import { loadMeetingPins } from "@/lib/visits";
import { AnalyticsPage } from "./analytics-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analytics · Paperback Riders",
  description:
    "How many books Paperback Riders has read, how many pages those books add up to, the top genres, and where the club has met.",
};

export default async function Page() {
  await connection();
  const [reading, pins] = await Promise.all([loadReadingTotals(), loadMeetingPins()]);
  return <AnalyticsPage reading={reading} pins={pins} />;
}
