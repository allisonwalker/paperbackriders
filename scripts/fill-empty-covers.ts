import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { catalogFillDatabaseUrl, fillEmptyCovers, searchStoredBook, type CatalogFillPatch, type CatalogFillRow } from "../lib/books/catalog-fill";
import { picks } from "../lib/db/schema";

/**
 * Fills an empty cover and page count on months already stored.
 * It is not a web route. Run it locally:
 *   npx tsx --env-file=.env.local scripts/fill-empty-covers.ts
 */
async function main(): Promise<void> {
  const url = catalogFillDatabaseUrl(process.env);
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  try {
    const updated = await fillEmptyCovers(
      {
        async load(): Promise<CatalogFillRow[]> {
          const rows = await db
            .select({
              id: picks.id,
              kind: picks.kind,
              title: picks.title,
              author: picks.author,
              coverUrl: picks.coverUrl,
              pageCount: picks.pageCount,
              lookupKey: picks.lookupKey,
              lookupSource: picks.lookupSource,
              alsoTitle: picks.alsoTitle,
              alsoAuthor: picks.alsoAuthor,
              alsoCoverUrl: picks.alsoCoverUrl,
              alsoPageCount: picks.alsoPageCount,
              alsoLookupKey: picks.alsoLookupKey,
              alsoLookupSource: picks.alsoLookupSource,
            })
            .from(picks);
          return rows.map((row) => ({
            id: row.id,
            kind: kindOf(row.kind),
            title: row.title,
            author: row.author,
            coverUrl: row.coverUrl,
            pageCount: row.pageCount,
            lookupKey: row.lookupKey,
            lookupSource: row.lookupSource,
            alsoTitle: row.alsoTitle,
            alsoAuthor: row.alsoAuthor,
            alsoCoverUrl: row.alsoCoverUrl,
            alsoPageCount: row.alsoPageCount,
            alsoLookupKey: row.alsoLookupKey,
            alsoLookupSource: row.alsoLookupSource,
          }));
        },
        async save(id: string, patch: CatalogFillPatch): Promise<void> {
          await db.update(picks).set(patch).where(eq(picks.id, id));
        },
      },
      (title, author) => searchStoredBook(title, author, fetch),
      (line) => console.log(line),
    );
    const months = updated === 1 ? "month" : "months";
    console.log(`Covers and page counts filled on ${updated} ${months}.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function kindOf(kind: string): CatalogFillRow["kind"] {
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
  const message = error instanceof Error ? error.message : "The catalog fill failed";
  if (message.includes("postgres://") || message.includes("postgresql://")) return "The catalog fill failed";
  return message;
}
