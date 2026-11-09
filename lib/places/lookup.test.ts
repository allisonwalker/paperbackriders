import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { verifyPlaceCandidate } from "./candidate";
import { isGeoapifyGeocodeUrl, parseClubPlaceBias, searchPlacesForRecordKeeper } from "./lookup";

const root = path.resolve(import.meta.dirname, "../..");
const march = "2026-03-01";
const pickId = "33333333-3333-4333-8333-333333333333";
const rubyId = "5194bdd3571f9c5ec0591fdef5f61ea04740f00102f90188669f1000000000c00203";
const londonId = "51f07665660fc4024059dc0a96dfac6c51f07665660fc4024059dc0a96dfac6c";
const apiKey = "geoapify-test-key-should-stay-server";
const secret = "better-auth-secret-value";
const sessionToken = "session.token.value";
const venueName = "The Ruby";
const now = 1_700_000_000_000;

const env = {
  GEOAPIFY_API_KEY: apiKey,
  CLUB_PLACE_BIAS: "47.61,-122.33",
  BETTER_AUTH_SECRET: secret,
};

const keeper = async () => ({ email: "keeper@example.com" });
const stranger = async () => ({ email: "member@example.com" });
const nobody = async () => null;

function feature(options: {
  label: string;
  latitude: number;
  longitude: number;
  placeId: string;
  propertyLatitude?: number;
  propertyLongitude?: number;
}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [options.longitude, options.latitude] },
    properties: {
      formatted: options.label,
      lat: options.propertyLatitude ?? options.latitude,
      lon: options.propertyLongitude ?? options.longitude,
      place_id: options.placeId,
      datasource: { attribution: "© OpenStreetMap contributors" },
    },
  };
}

function jsonResponse(payload: unknown, status = 200, url = ""): Response {
  const response = new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/geo+json" },
  });
  if (url) Object.defineProperty(response, "url", { value: url });
  return response;
}

function fetchSpy(response: Response | (() => Response | Promise<Response>)) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return typeof response === "function" ? response() : response;
  };
  return { calls, fetchImpl };
}

function searchOptions(
  fetchImpl: typeof fetch,
  readSession: typeof keeper | typeof stranger | typeof nobody = keeper,
  readVisit: (month: string) => Promise<{ pickId: string; enteredName: string } | null> = async () => ({
    pickId,
    enteredName: venueName,
  }),
  searchEnv: Partial<typeof env> | undefined = env,
) {
  return {
    fetch: fetchImpl,
    readSession,
    allowlisted: "keeper@example.com",
    env: searchEnv,
    now: () => now,
    readVisit,
  };
}

describe("Geoapify search URL", () => {
  test("allows only the geocoding host", () => {
    expect(isGeoapifyGeocodeUrl(new URL("https://api.geoapify.com/v1/geocode/search"))).toBe(true);
    expect(isGeoapifyGeocodeUrl(new URL("https://api.geoapify.com/v1/geocode/search?text=Ruby"))).toBe(true);
    expect(isGeoapifyGeocodeUrl(new URL("http://api.geoapify.com/v1/geocode/search"))).toBe(false);
    expect(isGeoapifyGeocodeUrl(new URL("https://evil.example/v1/geocode/search"))).toBe(false);
    expect(isGeoapifyGeocodeUrl(new URL("https://api.geoapify.com.evil.example/v1/geocode/search"))).toBe(false);
    expect(isGeoapifyGeocodeUrl(new URL("https://user:pass@api.geoapify.com/v1/geocode/search"))).toBe(false);
    expect(isGeoapifyGeocodeUrl(new URL("https://api.geoapify.com/v1/geocode/reverse"))).toBe(false);
    expect(isGeoapifyGeocodeUrl(new URL("https://nominatim.openstreetmap.org/search"))).toBe(false);
  });

  test("reads a latitude,longitude bias and refuses anything else", () => {
    expect(parseClubPlaceBias("47.61,-122.33")).toEqual({ latitude: 47.61, longitude: -122.33 });
    expect(parseClubPlaceBias(" 47.61, -122.33 ")).toEqual({ latitude: 47.61, longitude: -122.33 });
    expect(parseClubPlaceBias(undefined)).toBeNull();
    expect(parseClubPlaceBias("")).toBeNull();
    expect(parseClubPlaceBias("Seattle")).toBeNull();
    expect(parseClubPlaceBias("47.61")).toBeNull();
    expect(parseClubPlaceBias("47.61,-122.33,10")).toBeNull();
    expect(parseClubPlaceBias("91,0")).toBeNull();
    expect(parseClubPlaceBias("0,181")).toBeNull();
  });
});

describe("place search", () => {
  test("one result is a list of one and does not select or store it", async () => {
    const { calls, fetchImpl } = fetchSpy(
      jsonResponse({
        features: [
          feature({ label: "The Ruby, Seattle, Washington", latitude: 47.615, longitude: -122.33, placeId: rubyId }),
          feature({ label: "Ruby Lounge, London", latitude: 51.5, longitude: -0.12, placeId: londonId }),
        ],
      }),
    );
    const reads: string[] = [];

    const result = await searchPlacesForRecordKeeper(
      { month: "2026-03" },
      searchOptions(fetchImpl, keeper, async (month) => {
        reads.push(month);
        return { pickId, enteredName: `  ${venueName}  ` };
      }),
    );

    expect(result.status).toBe("matches");
    if (result.status !== "matches") return;
    expect(result.candidates).toHaveLength(2);
    expect(Object.keys(result.candidates[0] ?? {}).sort()).toEqual(["label", "token"]);
    expect(result.candidates[0]).toMatchObject({ label: "The Ruby, Seattle, Washington" });
    expect(result.candidates[1]).toMatchObject({ label: "Ruby Lounge, London" });
    expect(JSON.stringify(result)).not.toContain(apiKey);
    expect(JSON.stringify(result)).not.toContain("latitude");
    expect(verifyPlaceCandidate(result.candidates[0]?.token, secret, now)).toMatchObject({
      label: "The Ruby, Seattle, Washington",
      latitude: 47.615,
      longitude: -122.33,
      provider: "geoapify",
      providerId: rubyId,
    });
    expect(reads).toEqual([march]);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]?.url ?? "");
    expect(url.origin).toBe("https://api.geoapify.com");
    expect(url.pathname).toBe("/v1/geocode/search");
    expect(url.searchParams.get("text")).toBe(venueName);
    expect(url.searchParams.get("bias")).toBe("proximity:-122.33,47.61");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("format")).toBe("geojson");
    expect(url.searchParams.get("filter")).toBeNull();
    expect(url.searchParams.get("apiKey")).toBe(apiKey);
    expect(calls[0]?.init?.redirect).toBe("manual");
    expect(calls[0]?.init?.credentials).toBe("omit");
    expect(new Headers(calls[0]?.init?.headers).get("cookie")).toBeNull();
  });

  test("a typed place is what gets searched, not the stored venue name", async () => {
    const { calls, fetchImpl } = fetchSpy(
      jsonResponse({
        features: [feature({ label: "Brix Tavern, Portland", latitude: 47.62, longitude: -122.32, placeId: rubyId })],
      }),
    );

    const result = await searchPlacesForRecordKeeper(
      { month: march, query: "  Brix Tavern  " },
      searchOptions(fetchImpl, keeper, async () => ({ pickId, enteredName: venueName })),
    );

    expect(result.status).toBe("matches");
    expect(new URL(calls[0]?.url ?? "").searchParams.get("text")).toBe("Brix Tavern");
  });

  test("a single result is still not chosen", async () => {
    const { fetchImpl } = fetchSpy(
      jsonResponse({
        features: [feature({ label: "Cal Anderson Park", latitude: 47.6158, longitude: -122.3194, placeId: rubyId })],
      }),
    );

    const result = await searchPlacesForRecordKeeper({ month: march }, searchOptions(fetchImpl));

    expect(result).toMatchObject({ status: "matches" });
    if (result.status !== "matches") return;
    expect(result.candidates).toHaveLength(1);
    expect(result).not.toHaveProperty("placeId");
    expect(result).not.toHaveProperty("selected");
  });

  test("zero usable results store nothing and do not invent a place", async () => {
    const cases = [
      { features: [] },
      {
        features: [
          feature({
            label: "Wrong coordinates",
            latitude: 47.6,
            longitude: -122.3,
            placeId: rubyId,
            propertyLatitude: 40,
            propertyLongitude: -73,
          }),
        ],
      },
      { features: [feature({ label: "No id", latitude: 47.6, longitude: -122.3, placeId: "short" })] },
    ];

    for (const payload of cases) {
      const { calls, fetchImpl } = fetchSpy(jsonResponse(payload));
      const result = await searchPlacesForRecordKeeper({ month: march }, searchOptions(fetchImpl));
      expect(result).toEqual({ status: "empty" });
      expect(calls).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain("latitude");
    }
  });

  test("a missing bias, a missing key, or a missing secret does not call Geoapify", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const readVisit = vi.fn(async () => ({ pickId, enteredName: venueName }));

    await expect(
      searchPlacesForRecordKeeper({ month: march }, searchOptions(fetchImpl, keeper, readVisit, { ...env, CLUB_PLACE_BIAS: "" })),
    ).resolves.toEqual({ status: "unconfigured" });
    await expect(
      searchPlacesForRecordKeeper(
        { month: march },
        searchOptions(fetchImpl, keeper, readVisit, { ...env, CLUB_PLACE_BIAS: "Seattle" }),
      ),
    ).resolves.toEqual({ status: "unconfigured" });
    await expect(
      searchPlacesForRecordKeeper({ month: march }, searchOptions(fetchImpl, keeper, readVisit, { ...env, GEOAPIFY_API_KEY: "" })),
    ).resolves.toEqual({ status: "unavailable" });
    await expect(
      searchPlacesForRecordKeeper(
        { month: march },
        searchOptions(fetchImpl, keeper, readVisit, { ...env, BETTER_AUTH_SECRET: "" }),
      ),
    ).resolves.toEqual({ status: "unavailable" });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readVisit).not.toHaveBeenCalled();
  });

  test("a caller who is not the record keeper cannot search", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const readVisit = vi.fn(async () => ({ pickId, enteredName: venueName }));

    await expect(searchPlacesForRecordKeeper({ month: march }, searchOptions(fetchImpl, nobody, readVisit))).resolves.toEqual({
      status: "forbidden",
    });
    await expect(searchPlacesForRecordKeeper({ month: march }, searchOptions(fetchImpl, stranger, readVisit))).resolves.toEqual({
      status: "forbidden",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(readVisit).not.toHaveBeenCalled();
  });

  test("a month with no saved venue name does not search", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      searchPlacesForRecordKeeper({ month: "not-a-month" }, searchOptions(fetchImpl, keeper, async () => {
        throw new Error("should not read");
      })),
    ).resolves.toEqual({ status: "missing" });
    await expect(
      searchPlacesForRecordKeeper({ month: march }, searchOptions(fetchImpl, keeper, async () => null)),
    ).resolves.toEqual({ status: "missing" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("a failed search stores nothing and the log omits the query, the key, and the session", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failures = [
      async () => {
        throw new Error(`${apiKey} ${venueName} ${sessionToken} postgres://user:secret@localhost/db`);
      },
      async () => jsonResponse({ features: [] }, 500),
      async () => jsonResponse({ features: [] }, 302, "https://evil.example/v1/geocode/search?apiKey=" + apiKey),
      async () => jsonResponse({ query: { text: venueName } }, 200),
    ];

    try {
      for (const respond of failures) {
        error.mockClear();
        const fetchImpl = vi.fn<typeof fetch>(respond);
        const result = await searchPlacesForRecordKeeper({ month: march }, searchOptions(fetchImpl));
        expect(result).toEqual({ status: "unavailable" });
        const logged = JSON.stringify(error.mock.calls);
        expect(logged).toContain("place search failed");
        expect(logged).toContain(pickId);
        expect(logged).not.toContain(apiKey);
        expect(logged).not.toContain(venueName);
        expect(logged).not.toContain(sessionToken);
        expect(logged).not.toContain("postgres://");
      }
    } finally {
      error.mockRestore();
    }
  });

  test("keeps at most five matches", async () => {
    const features = Array.from({ length: 6 }, (_item, index) =>
      feature({
        label: `Place ${index + 1}`,
        latitude: 47.6,
        longitude: -122.3,
        placeId: `${rubyId.slice(0, -2)}${index}${index}`,
      }),
    );
    const { calls, fetchImpl } = fetchSpy(jsonResponse({ features }));

    const result = await searchPlacesForRecordKeeper({ month: march }, searchOptions(fetchImpl));

    expect(result.status).toBe("matches");
    if (result.status !== "matches") return;
    expect(result.candidates).toHaveLength(5);
    expect(result.candidates.map((candidate) => candidate.label)).toEqual(["Place 1", "Place 2", "Place 3", "Place 4", "Place 5"]);
    expect(new URL(calls[0]?.url ?? "").searchParams.get("limit")).toBe("5");
  });
});

describe("where Geoapify may be requested", () => {
  test("the geocoding host and the key live only in the adapter", () => {
    const files = sourceFiles(path.join(root, "app")).concat(sourceFiles(path.join(root, "lib")));
    const hosts = files.filter((file) => readFileSync(file, "utf8").includes("api.geoapify.com"));
    const keys = files.filter((file) => readFileSync(file, "utf8").includes("GEOAPIFY_API_KEY"));
    const publicKeys = files.filter((file) => readFileSync(file, "utf8").includes("NEXT_PUBLIC_GEOAPIFY"));

    expect(hosts.map((file) => path.relative(root, file))).toEqual(["lib/places/lookup.ts"]);
    expect(keys.map((file) => path.relative(root, file))).toEqual(["lib/places/lookup.ts"]);
    expect(publicKeys).toEqual([]);

    const adapter = readFileSync(path.join(root, "lib/places/lookup.ts"), "utf8");
    expect(adapter).toContain("requireRecordKeeper(");
    expect(adapter).toContain('redirect: "manual"');
    expect(adapter).toContain('credentials: "omit"');
    expect(adapter).not.toContain(".insert(places)");
    expect(adapter).not.toContain("saveConfirmedPlace");
    expect(adapter).not.toMatch(/nominatim|googleapis|opencage/i);

    const action = readFileSync(path.join(root, "app/edit/place-actions.ts"), "utf8");
    expect(action).toContain("use server");
    expect(action).toContain('formData.get("month")');
    expect(action).toContain('formData.get("candidate")');
    expect(action).not.toMatch(/\bfetch\s*\(|GEOAPIFY_API_KEY|latitude|longitude/);

    for (const file of [
      "app/page.tsx",
      "app/public-page.tsx",
      "app/analytics/page.tsx",
      "app/edit/meeting-actions.ts",
      "app/edit/meeting-form.tsx",
      "lib/meeting-records.ts",
      "lib/visits.ts",
    ]) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source).not.toContain("places/lookup");
      expect(source).not.toContain("searchPlacesForRecordKeeper");
      expect(source).not.toContain("confirmPlaceSelection");
    }

    const routes = sourceFiles(path.join(root, "app/api"));
    expect(routes.map((file) => path.relative(root, file))).toEqual(["app/api/auth/[...all]/route.ts"]);
  });
});

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sourceFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) files.push(full);
  }
  return files;
}
