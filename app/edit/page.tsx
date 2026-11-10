import type { Metadata } from "next";
import { connection } from "next/server";
import { clubCalendarDate, clubMonthStart, clubTimeZone } from "@/lib/club-date";
import { readEditAccess } from "@/lib/edit-access";
import { loadEditorMeeting } from "@/lib/meeting";
import { loadEditorPicks } from "@/lib/picks";
import { loadVenueName } from "@/lib/visit-records";
import { monthInputValue } from "@/lib/validation";
import { EditScreen } from "./edit-screen";
import { readEditorQuery } from "./editor-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const access = await readEditAccess();
  if (access.status === "signed-in") {
    return {
      title: "Records · Paperback Riders",
      description: "Add or correct a month's pick for Paperback Riders.",
    };
  }
  return {
    title: "Sign in · Paperback Riders",
    description: "Sign in to keep the Paperback Riders records.",
  };
}

type EditSearch = {
  month?: string | string[];
  saved?: string | string[];
  deleted?: string | string[];
  meeting?: string | string[];
  venue?: string | string[];
  place?: string | string[];
  tab?: string | string[];
};

export default async function EditPage({ searchParams }: { searchParams: Promise<EditSearch> }) {
  await connection();
  const [access, query] = await Promise.all([readEditAccess(), searchParams]);
  if (access.status !== "signed-in") {
    return <EditScreen access={access} />;
  }

  const { selectedMonth, notice, tab } = readEditorQuery(query);
  const now = new Date();
  const timeZone = clubTimeZone();
  const currentMonth = clubMonthStart(now, timeZone);
  const [records, meeting, venue] = await Promise.all([
    loadEditorPicks(),
    loadEditorMeeting({ timeZone }),
    selectedMonth ? loadVenueName(selectedMonth) : Promise.resolve(null),
  ]);

  return (
    <EditScreen
      access={access}
      records={records}
      selectedMonth={selectedMonth}
      notice={notice}
      defaultMonth={monthInputValue(currentMonth)}
      today={clubCalendarDate(now, timeZone)}
      currentMonth={currentMonth}
      meeting={meeting}
      venue={venue}
      tab={tab}
    />
  );
}
