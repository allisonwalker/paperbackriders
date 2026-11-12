import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { readingTotals } from "./reading";
import {
  fillRecordedGenres,
  RECORDED_GENRES,
  recordedGenreDatabaseUrl,
  recordedGenrePatch,
  type RecordedGenrePatch,
  type RecordedGenreRow,
  type RecordedGenreStore,
} from "./recorded-genres";

const root = path.resolve(import.meta.dirname, "..");
const productionHost = "ep-live.example.neon.tech";
const previewHost = "ep-preview.example.neon.tech";
const secretUrl = `postgres://user:s3cret@${productionHost}/neondb`;
const previewUrl = `postgres://user:s3cret@${previewHost}/neondb`;

const CHART_NAMES: readonly (readonly [string, string])[] = [
  ["The Wicker Husband", "Romance"],
  ["The Prestige", "Historical fiction"],
  ["A Thousand Ships", "Historical fiction"],
  ["North Woods", "Historical fiction"],
  ["Shadow of the Wind", "Historical fiction"],
  ["Red Winter", "Fantasy"],
  ["The Employees", "Science fiction"],
  ["The Shining Girls", "Science fiction"],
  ["The Husbands", "Romantic comedy"],
  ["Lovelight Farms", "Romantic comedy"],
  ["Greta & Valdin", "Romantic comedy"],
  ["Lifeforms", "Memoir"],
  ["Stiff", "Nonfiction"],
  ["Big Friendship", "Nonfiction"],
];

function row(overrides: Partial<RecordedGenreRow> = {}): RecordedGenreRow {
  return {
    id: "pick-1",
    kind: "book",
    title: null,
    genre: null,
    pageCount: null,
    alsoTitle: null,
    alsoGenre: null,
    alsoCoverUrl: null,
    alsoPageCount: null,
    ...overrides,
  };
}

function memoryStore(rows: RecordedGenreRow[]): RecordedGenreStore & { saved: { id: string; patch: RecordedGenrePatch }[] } {
  return {
    saved: [],
    async load() {
      return rows;
    },
    async save(id, patch) {
      this.saved.push({ id, patch });
      const stored = rows.find((item) => item.id === id);
      if (!stored) throw new Error("missing pick");
      if (patch.genre) stored.genre = patch.genre;
      if (patch.alsoGenre) stored.alsoGenre = patch.alsoGenre;
      if (patch.alsoCoverUrl) stored.alsoCoverUrl = patch.alsoCoverUrl;
    },
  };
}

describe("recorded genres", () => {
  test("fills an empty genre from the recorded spelling, and leaves a saved genre", () => {
    const empty = row({ title: "Shadow of the Wind" });
    expect(recordedGenrePatch(empty)).toEqual({ genre: "Gothic mystery / historical fiction" });
    expect(empty.genre).toBeNull();
    expect(empty.pageCount).toBeNull();

    expect(recordedGenrePatch(row({ title: " shadow of the wind ", genre: "Historical fiction" }))).toBeNull();
    expect(recordedGenrePatch(row({ title: "Dawn", genre: "Space opera" }))).toBeNull();
    expect(recordedGenrePatch(row({ title: "The Left Hand of Darkness" }))).toBeNull();
    expect(recordedGenrePatch(row({ title: "Stiff" }))).toBeNull();
    expect(recordedGenrePatch(row({ title: "Stiff: The Curious Lives of Human Cadavers" }))).toBeNull();
  });

  test("uses the recorded spelling for every listed title and never the chart's shorter name", () => {
    expect(RECORDED_GENRES).toHaveLength(28);
    for (const [title, genre] of RECORDED_GENRES) {
      const stored = row({ id: title, title, pageCount: 12, alsoPageCount: 12 });
      const patch = recordedGenrePatch(stored);
      expect(patch).toEqual({ genre });
      expect(patch).not.toHaveProperty("pageCount");
      expect(patch).not.toHaveProperty("alsoPageCount");
      expect(stored.pageCount).toBe(12);
      expect(stored.alsoPageCount).toBe(12);
    }

    for (const [title, chartName] of CHART_NAMES) {
      const patch = recordedGenrePatch(row({ title }));
      if (title === "Stiff") {
        expect(patch).toBeNull();
      } else {
        expect(patch?.genre).not.toBe(chartName);
      }
    }
  });

  test("fills the second book the same way, and the Wicker Husband cover only when it is empty", () => {
    expect(
      recordedGenrePatch(
        row({
          title: "Somebody is Walking on Your Grave",
          alsoTitle: "The Wicker Husband",
        }),
      ),
    ).toEqual({
      genre: "Nonfiction (travel / memoir)",
      alsoGenre: "Romance / fantasy / short story",
      alsoCoverUrl: "/covers/the-wicker-husband.png",
    });

    expect(
      recordedGenrePatch(
        row({
          title: "Somebody is Walking on Your Grave",
          genre: "Nonfiction (travel / memoir)",
          alsoTitle: "The Wicker Husband",
          alsoGenre: "Romance",
          alsoCoverUrl: null,
        }),
      ),
    ).toEqual({ alsoCoverUrl: "/covers/the-wicker-husband.png" });

    expect(
      recordedGenrePatch(
        row({
          alsoTitle: "The Wicker Husband",
          alsoGenre: "Romance / fantasy / short story",
          alsoCoverUrl: "https://covers.openlibrary.org/b/id/9-L.jpg",
        }),
      ),
    ).toBeNull();
  });

  test("does not give a prompt a genre", () => {
    const prompt = row({
      kind: "prompt",
      title: "Dawn",
      genre: null,
      alsoTitle: "The Wicker Husband",
    });
    expect(recordedGenrePatch(prompt)).toBeNull();
  });

  test("the chart still groups Shadow of the Wind as Historical fiction after the stored genre is filled", () => {
    const stored = row({ title: "Shadow of the Wind", pageCount: null });
    const patch = recordedGenrePatch(stored);
    expect(patch?.genre).toBe("Gothic mystery / historical fiction");

    const totals = readingTotals(
      [
        {
          month: "2024-06-01",
          kind: "book",
          title: "Shadow of the Wind",
          pageCount: null,
          genre: patch?.genre ?? null,
        },
      ],
      "2026-11-01",
    );

    expect(totals.pageTotal).toBe(0);
    expect(totals.genres.map((genre) => genre.label)).toEqual(["Historical fiction"]);
  });

  test("writes a month once, skips a month that already has its genre, and does not invent a page count", async () => {
    const rows = [
      row({ id: "shadow", title: "Shadow of the Wind", pageCount: null }),
      row({ id: "kept", title: "Dawn", genre: "Space opera", pageCount: null }),
      row({ id: "prompt", kind: "prompt", title: "Piranesi" }),
      row({
        id: "october",
        title: "Somebody is Walking on Your Grave",
        genre: "Nonfiction (travel / memoir)",
        alsoTitle: "The Wicker Husband",
        alsoPageCount: null,
      }),
    ];
    const store = memoryStore(rows);

    await expect(fillRecordedGenres(store)).resolves.toBe(2);
    expect(store.saved).toEqual([
      { id: "shadow", patch: { genre: "Gothic mystery / historical fiction" } },
      {
        id: "october",
        patch: {
          alsoGenre: "Romance / fantasy / short story",
          alsoCoverUrl: "/covers/the-wicker-husband.png",
        },
      },
    ]);
    expect(rows.map((item) => item.pageCount)).toEqual([null, null, null, null]);
    expect(rows[3]?.alsoPageCount).toBeNull();

    store.saved.length = 0;
    await expect(fillRecordedGenres(store)).resolves.toBe(0);
    expect(store.saved).toEqual([]);
  });

  test("stops when a write fails", async () => {
    const store: RecordedGenreStore = {
      async load() {
        return [row({ title: "Dawn" }), row({ id: "next", title: "Piranesi" })];
      },
      async save() {
        throw new Error("connection refused");
      },
    };

    await expect(fillRecordedGenres(store)).rejects.toThrow("connection refused");
  });

  test("is not a web route", () => {
    const source = readFileSync(path.join(root, "lib/recorded-genres.ts"), "utf8");
    const script = readFileSync(path.join(root, "scripts/fill-recorded-genres.ts"), "utf8");
    expect(source).not.toContain('from "./reading"');
    expect(source).not.toContain("pageCount =");
    expect(source).not.toContain("alsoPageCount =");
    expect(script).toContain("recordedGenreDatabaseUrl");
    expect(script).not.toContain("picks.pageCount");
    expect(script).not.toContain("picks.alsoPageCount");
    expect(script).not.toContain("NextRequest");
    expect(script).not.toContain("next/server");

    const appFiles = filesUnder(path.join(root, "app")).filter((file) => /\.(ts|tsx)$/.test(file));
    for (const file of appFiles) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toContain("recorded-genres");
      expect(text).not.toContain("fillRecordedGenres");
    }
  });
});

describe("recorded genre database", () => {
  test("opens a local catalog and production only after the restore check", () => {
    expect(
      recordedGenreDatabaseUrl({
        DATABASE_URL: previewUrl,
        PRODUCTION_DATABASE_HOST: productionHost,
      }),
    ).toBe(previewUrl);

    expect(
      recordedGenreDatabaseUrl({
        DATABASE_URL: secretUrl,
        PRODUCTION_DATABASE_HOST: "ep-live-pooler.example.neon.tech",
        CATALOG_RESTORE_HOST: "ep-restore.example.neon.tech",
      }),
    ).toBe(secretUrl);
  });

  test("refuses a deployment, and production without a restore, without echoing the url", () => {
    const cases = [
      () =>
        recordedGenreDatabaseUrl({
          VERCEL: "1",
          DATABASE_URL: secretUrl,
          PRODUCTION_DATABASE_HOST: productionHost,
        }),
      () =>
        recordedGenreDatabaseUrl({
          VERCEL_ENV: "preview",
          DATABASE_URL: previewUrl,
          PRODUCTION_DATABASE_HOST: productionHost,
        }),
      () =>
        recordedGenreDatabaseUrl({
          DATABASE_URL: secretUrl,
          PRODUCTION_DATABASE_HOST: productionHost,
        }),
    ];

    for (const run of cases) {
      let thrown: unknown;
      try {
        run();
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).not.toContain("s3cret");
      expect(message).not.toContain("postgres://");
    }
  });
});

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(full);
    return [full];
  });
}
