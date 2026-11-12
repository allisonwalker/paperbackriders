import { assertProductionImport, assertRuntimeDatabase, type ProcessEnv } from "./database-isolation";
import { WICKER_HUSBAND_COVER } from "./cover";

/**
 * Genres recorded for the club, matched on the stored title.
 * The genre chart uses these, with a parenthetical note removed.
 */
export const RECORDED_GENRES: readonly (readonly [string, string])[] = [
  ["Motherthing", "Horror (dark comedy)"],
  ["Shadow of the Wind", "Gothic mystery / historical fiction"],
  ["Bliss Montage", "Literary fiction (speculative short stories)"],
  ["Dawn", "Science fiction"],
  ["Greta & Valdin", "Contemporary fiction (romantic comedy)"],
  ["Pachinko", "Historical fiction"],
  ["The Shining Girls", "Thriller (time-travel / sci-fi)"],
  ["North Woods", "Literary historical fiction"],
  ["Lovelight Farms", "Romance (rom-com)"],
  ["Big Friendship", "Nonfiction (self-help / relationships)"],
  ["Carmilla", "Gothic horror (vampire)"],
  ["Only the Animals", "Literary fiction (short stories)"],
  ["All Systems Red", "Science fiction"],
  ["The Empress of Salt and Fortune", "Fantasy"],
  ["King of Ashes", "Crime thriller"],
  ["We Do Not Part", "Literary fiction"],
  ["Stiff: The Curious Life of Human Cadavers", "Popular science nonfiction"],
  ["Lifeforms", "Memoir / essays"],
  ["The Husbands", "Speculative fiction (romantic comedy)"],
  ["The Employees", "Science fiction (literary)"],
  ["Piranesi", "Fantasy"],
  ["Red Winter", "Dark historical fantasy"],
  ["Yesteryear", "Satirical thriller"],
  ["Tilt", "Literary fiction"],
  ["A Thousand Ships", "Historical fiction (mythological retelling)"],
  ["The Prestige", "Historical fiction with sci-fi elements"],
  ["Somebody is Walking on Your Grave", "Nonfiction (travel / memoir)"],
  ["The Wicker Husband", "Romance"],
];

const RECORDED_BY_TITLE = new Map<string, string>(
  RECORDED_GENRES.map(([title, genre]) => [titleKey(title), genre]),
);

const WICKER_HUSBAND_TITLE = titleKey("The Wicker Husband");

export type RecordedGenreRow = {
  id: string;
  kind: "book" | "prompt";
  title: string | null;
  genre: string | null;
  pageCount: number | null;
  alsoTitle: string | null;
  alsoGenre: string | null;
  alsoCoverUrl: string | null;
  alsoPageCount: number | null;
};

/** Fields this fill may write. Page counts are never among them. */
export type RecordedGenrePatch = {
  genre?: string;
  alsoGenre?: string;
  alsoCoverUrl?: string;
};

export type RecordedGenreStore = {
  load(): Promise<readonly RecordedGenreRow[]>;
  save(id: string, patch: RecordedGenrePatch): Promise<void>;
};

export function recordedGenrePatch(row: RecordedGenreRow): RecordedGenrePatch | null {
  if (row.kind === "prompt") return null;
  if (row.kind !== "book") {
    throw new Error("A pick must be a book or a prompt");
  }

  const patch: RecordedGenrePatch = {};
  const genre = genreToWrite(row.genre, recordedGenreFor(row.title));
  if (genre) patch.genre = genre;

  const alsoGenre = genreToWrite(row.alsoGenre, recordedGenreFor(row.alsoTitle));
  if (alsoGenre) patch.alsoGenre = alsoGenre;
  if (titleKey(row.alsoTitle) === WICKER_HUSBAND_TITLE && row.alsoCoverUrl == null) {
    patch.alsoCoverUrl = WICKER_HUSBAND_COVER;
  }

  if (patch.genre == null && patch.alsoGenre == null && patch.alsoCoverUrl == null) return null;
  return patch;
}

/** How many stored months gained an empty genre or the Wicker Husband cover. */
export async function fillRecordedGenres(store: RecordedGenreStore): Promise<number> {
  const rows = await store.load();
  let updated = 0;
  for (const row of rows) {
    const patch = recordedGenrePatch(row);
    if (!patch) continue;
    await store.save(row.id, patch);
    updated += 1;
  }
  return updated;
}

/**
 * The fill runs on a trusted machine, never on a deployment.
 * A non-production database is the usual local catalog. Production is allowed
 * only through the same restore check as the other one-time imports.
 */
export function recordedGenreDatabaseUrl(env: ProcessEnv): string {
  if (env.VERCEL === "1" || env.VERCEL_ENV?.trim()) {
    throw new Error("The genre fill does not run on a deployment");
  }
  try {
    return assertRuntimeDatabase(env);
  } catch (error) {
    if (error instanceof Error && error.message === "This environment must not use the production database") {
      assertProductionImport(env);
      const url = env.DATABASE_URL?.trim();
      if (!url) throw new Error("DATABASE_URL is not set");
      return url;
    }
    throw error;
  }
}

const REPLACED_WICKER_GENRE = "Romance / fantasy / short story";

/** An empty genre is filled. The Wicker Husband's earlier longer genre becomes Romance. */
function genreToWrite(current: string | null, recorded: string | null): string | undefined {
  if (!recorded) return undefined;
  if (current == null) return recorded;
  if (current === REPLACED_WICKER_GENRE && recorded !== current) return recorded;
  return undefined;
}

function recordedGenreFor(title: string | null): string | null {
  const key = titleKey(title);
  if (!key) return null;
  return RECORDED_BY_TITLE.get(key) ?? null;
}

function titleKey(title: string | null): string {
  return (title ?? "").trim().toLocaleLowerCase("en-US");
}
