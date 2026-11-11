import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { picks } from "../lib/db/schema";
import {
  fillRecordedGenres,
  recordedGenreDatabaseUrl,
  type RecordedGenrePatch,
  type RecordedGenreRow,
} from "../lib/recorded-genres";

/**
 * Fills an empty genre, and the Wicker Husband cover, on months already stored.
 * It is not a web route. Run it locally:
 *   npx tsx --env-file=.env.local scripts/fill-recorded-genres.ts
 */
async function main(): Promise<void> {
  const url = recordedGenreDatabaseUrl(process.env);
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  try {
    const updated = await fillRecordedGenres({
      async load(): Promise<RecordedGenreRow[]> {
        const rows = await db
          .select({
            id: picks.id,
            kind: picks.kind,
            title: picks.title,
            genre: picks.genre,
            alsoTitle: picks.alsoTitle,
            alsoGenre: picks.alsoGenre,
            alsoCoverUrl: picks.alsoCoverUrl,
          })
          .from(picks);
        return rows.map((row) => ({
          id: row.id,
          kind: kindOf(row.kind),
          title: row.title,
          genre: row.genre,
          pageCount: null,
          alsoTitle: row.alsoTitle,
          alsoGenre: row.alsoGenre,
          alsoCoverUrl: row.alsoCoverUrl,
          alsoPageCount: null,
        }));
      },
      async save(id: string, patch: RecordedGenrePatch): Promise<void> {
        await db.update(picks).set(patch).where(eq(picks.id, id));
      },
    });
    const months = updated === 1 ? "month" : "months";
    console.log(`Recorded genres filled on ${updated} ${months}.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function kindOf(kind: string): RecordedGenreRow["kind"] {
  if (kind === "book" || kind === "prompt") return kind;
  throw new Error("A pick must be a book or a prompt");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(publicMessage(error));
    process.exitCode = 1;
  });
}

function publicMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "The genre fill failed";
  if (message.includes("postgres://") || message.includes("postgresql://")) return "The genre fill failed";
  return message;
}
