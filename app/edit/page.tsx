import { connection } from "next/server";
import { readEditAccess } from "@/lib/edit-access";
import { EditScreen } from "./edit-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in · Paperback Riders",
  description: "Sign in to keep the Paperback Riders records.",
};

export default async function EditPage() {
  await connection();
  const access = await readEditAccess();
  return <EditScreen access={access} />;
}
