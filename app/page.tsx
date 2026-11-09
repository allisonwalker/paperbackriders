import { connection } from "next/server";
import { loadFeaturedPick } from "@/lib/picks";
import { PublicPage } from "./public-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page() {
  await connection();
  const state = await loadFeaturedPick();
  return <PublicPage state={state} />;
}
