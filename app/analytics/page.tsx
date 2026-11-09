import { connection } from "next/server";
import { loadReadingTotals } from "@/lib/reading";
import { AnalyticsPage } from "./analytics-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Book analytics",
  description: "How many books Paperback Riders has read, how many pages those books add up to, and the top genres.",
};

export default async function Page() {
  await connection();
  const reading = await loadReadingTotals();
  return <AnalyticsPage reading={reading} />;
}
