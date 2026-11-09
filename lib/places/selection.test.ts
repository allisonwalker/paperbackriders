import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { PLACE_CANDIDATE_TTL_MS, signPlaceCandidate, verifyPlaceCandidate } from "./candidate";
import { searchPlacesForRecordKeeper } from "./lookup";
import {
  clearPlaceSelection,
  confirmPlaceSelection,
  type ConfirmedPlaceWrite,
  type PlaceSelectionStore,
  type PlaceVisitRef,
} from "./selection";
import { RecordKeeperRequiredError } from "../record-keeper";

const march = "2026-03-01";
const april = "2026-04-01";
const may = "2026-05-01";
const secret = "better-auth-secret-value";
const now = 1_700_000_000_000;
const rubyId = "5194bdd3571f9c5ec0591fdef5f61ea04740f00102f90188669f1000000000c00203";
const otherRubyId = "51f07665660fc4024059dc0a96dfac6c51f07665660fc4024059dc0a96dfac6c";

const keeper = async () => ({ email: "keeper@example.com" });
const stranger = async () => ({ email: "member@example.com" });
const nobody = async () => null;

type MemoryPlace = ConfirmedPlaceWrite & { id: string };
type MemoryVisit = PlaceVisitRef & { month: string };

function memory() {
  const places: MemoryPlace[] = [];
  const visits = new Map<string, MemoryVisit>([
    [march, { id: "visit-march", pickId: "pick-march", enteredName: "Ruby", placeId: null, month: march }],
    [april, { id: "visit-april", pickId: "pick-april", enteredName: "The Ruby", placeId: null, month: april }],
    [may, { id: "visit-may", pickId: "pick-may", enteredName: "Ruby Lounge", placeId: null, month: may }],
  ]);
  const store: PlaceSelectionStore = {
    async findVisit(month) {
      const visit = visits.get(month);
      return visit ? { ...visit } : null;
    },
    async saveConfirmedPlace(visitId, place) {
      const visit = [...visits.values()].find((item) => item.id === visitId);
      if (!visit) return null;
      let row = places.find((item) => item.provider === place.provider && item.providerId === place.providerId);
      if (row) {
        row.label = place.label;
        row.latitude = place.latitude;
        row.longitude = place.longitude;
      } else {
        row = { id: `place-${places.length + 1}`, ...place };
        places.push(row);
      }
      visit.placeId = row.id;
      return { placeId: row.id };
    },
    async clearPlace(visitId) {
      const visit = [...visits.values()].find((item) => item.id === visitId);
      if (!visit) return false;
      visit.placeId = null;
      return true;
    },
  };
  return { places, visits, store };
}

function writeOptions(
  store: PlaceSelectionStore,
  readSession: typeof keeper | typeof stranger | typeof nobody = keeper,
  clock: () => number = () => now,
) {
  return { store, readSession, allowlisted: "keeper@example.com", secret, now: clock };
}

function token(options: { label: string; latitude: number; longitude: number; providerId: string }, clock = now) {
  return signPlaceCandidate(
    { label: options.label, latitude: options.latitude, longitude: options.longitude, providerId: options.providerId },
    secret,
    clock,
  );
}

describe("a pin's coordinates exist only after she selects a match", () => {
  test("one result is not stored, zero results store nothing, and the same provider id is one place", async () => {
    const club = memory();
    const one = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-122.33, 47.615] },
      properties: {
        formatted: "The Ruby, Seattle, Washington",
        lat: 47.615,
        lon: -122.33,
        place_id: rubyId,
      },
    };
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ features: [one] }), { status: 200, headers: { "content-type": "application/geo+json" } });

    const found = await searchPlacesForRecordKeeper(
      { month: march },
      {
        fetch: fetchImpl,
        readSession: keeper,
        allowlisted: "keeper@example.com",
        env: {
          GEOAPIFY_API_KEY: "geoapify-test-key-should-stay-server",
          CLUB_PLACE_BIAS: "47.61,-122.33",
          BETTER_AUTH_SECRET: secret,
        },
        now: () => now,
        readVisit: async () => ({ pickId: "pick-march", enteredName: "Ruby" }),
      },
    );

    expect(found.status).toBe("matches");
    if (found.status !== "matches") return;
    expect(found.candidates).toHaveLength(1);
    expect(club.places).toEqual([]);
    expect(club.visits.get(march)?.placeId).toBeNull();

    const emptyFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ features: [] }), { status: 200, headers: { "content-type": "application/geo+json" } });
    const none = await searchPlacesForRecordKeeper(
      { month: april },
      {
        fetch: emptyFetch,
        readSession: keeper,
        allowlisted: "keeper@example.com",
        env: {
          GEOAPIFY_API_KEY: "geoapify-test-key-should-stay-server",
          CLUB_PLACE_BIAS: "47.61,-122.33",
          BETTER_AUTH_SECRET: secret,
        },
        now: () => now,
        readVisit: async () => ({ pickId: "pick-april", enteredName: "The Ruby" }),
      },
    );
    expect(none).toEqual({ status: "empty" });
    expect(club.places).toEqual([]);
    expect(club.visits.get(april)?.placeId).toBeNull();

    const input = { month: march, token: found.candidates[0]?.token, latitude: 0, longitude: 0 };
    const selected = await confirmPlaceSelection(input, writeOptions(club.store));
    expect(selected).toMatchObject({ status: "saved", month: march });
    expect(club.places).toHaveLength(1);
    expect(club.places[0]).toMatchObject({ latitude: 47.615, longitude: -122.33, providerId: rubyId });
    expect(club.visits.get(march)?.placeId).toBe(club.places[0]?.id);
    expect(club.visits.get(march)?.enteredName).toBe("Ruby");

    const again = await confirmPlaceSelection(
      {
        month: april,
        token: token({ label: "The Ruby, Seattle, Washington", latitude: 47.616, longitude: -122.331, providerId: rubyId }),
      },
      writeOptions(club.store),
    );
    expect(again.status).toBe("saved");
    expect(club.places).toHaveLength(1);
    expect(club.visits.get(april)?.placeId).toBe(club.visits.get(march)?.placeId);
    expect(club.places[0]).toMatchObject({ latitude: 47.616, longitude: -122.331 });

    const different = await confirmPlaceSelection(
      {
        month: may,
        token: token({ label: "Ruby Lounge, London", latitude: 51.5, longitude: -0.12, providerId: otherRubyId }),
      },
      writeOptions(club.store),
    );
    expect(different.status).toBe("saved");
    expect(club.places).toHaveLength(2);
    expect(club.visits.get(may)?.placeId).not.toBe(club.visits.get(march)?.placeId);
  });

  test("a tampered token, an expired token, or no selection writes nothing", async () => {
    const club = memory();
    const signed = token({ label: "The Ruby, Seattle", latitude: 47.615, longitude: -122.33, providerId: rubyId });
    const [payload, mac] = signed.split(".");
    const decoded = JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8")) as { latitude: number };
    decoded.latitude = 0;
    const tampered = `${Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url")}.${mac}`;

    await expect(confirmPlaceSelection({ month: march, token: tampered }, writeOptions(club.store))).resolves.toEqual({
      status: "rejected",
    });
    await expect(
      confirmPlaceSelection({ month: march, token: signed }, writeOptions(club.store, keeper, () => now + PLACE_CANDIDATE_TTL_MS)),
    ).resolves.toEqual({ status: "rejected" });
    await expect(confirmPlaceSelection({ month: march, token: "" }, writeOptions(club.store))).resolves.toEqual({
      status: "rejected",
    });
    await expect(
      confirmPlaceSelection({ month: march, token: signed }, { ...writeOptions(club.store), secret: "other-secret" }),
    ).resolves.toEqual({ status: "rejected" });

    expect(club.places).toEqual([]);
    expect(club.visits.get(march)?.placeId).toBeNull();
    expect(verifyPlaceCandidate(tampered, secret, now)).toBeNull();
  });

  test("a street-like label is saved when she selects it", async () => {
    const club = memory();
    const signed = token({
      label: "123 Main Street, Seattle, Washington",
      latitude: 47.6,
      longitude: -122.3,
      providerId: rubyId,
    });

    const result = await confirmPlaceSelection({ month: march, token: signed }, writeOptions(club.store));

    expect(result.status).toBe("saved");
    expect(club.places[0]?.label).toBe("123 Main Street, Seattle, Washington");
  });

  test("she can point a visit at another place or clear it without losing the name", async () => {
    const club = memory();
    const first = token({ label: "The Ruby, Seattle", latitude: 47.615, longitude: -122.33, providerId: rubyId });
    const second = token({ label: "Cal Anderson Park", latitude: 47.6158, longitude: -122.3194, providerId: otherRubyId });

    await confirmPlaceSelection({ month: march, token: first }, writeOptions(club.store));
    await confirmPlaceSelection({ month: march, token: second }, writeOptions(club.store));
    expect(club.visits.get(march)?.placeId).toBe(club.places[1]?.id);
    expect(club.places).toHaveLength(2);

    const cleared = await clearPlaceSelection({ month: march }, writeOptions(club.store));
    expect(cleared).toEqual({ status: "cleared", month: march });
    expect(club.visits.get(march)).toMatchObject({ placeId: null, enteredName: "Ruby" });
    expect(club.places).toHaveLength(2);

    await expect(clearPlaceSelection({ month: "2026-06-01" }, writeOptions(club.store))).resolves.toEqual({ status: "missing" });
  });

  test("a caller who is not the record keeper cannot confirm or clear", async () => {
    const club = memory();
    const signed = token({ label: "The Ruby, Seattle", latitude: 47.615, longitude: -122.33, providerId: rubyId });

    await expect(confirmPlaceSelection({ month: march, token: signed }, writeOptions(club.store, nobody))).rejects.toBeInstanceOf(
      RecordKeeperRequiredError,
    );
    await expect(confirmPlaceSelection({ month: march, token: signed }, writeOptions(club.store, stranger))).rejects.toBeInstanceOf(
      RecordKeeperRequiredError,
    );
    await expect(clearPlaceSelection({ month: march }, writeOptions(club.store, nobody))).rejects.toBeInstanceOf(
      RecordKeeperRequiredError,
    );
    expect(club.places).toEqual([]);
    expect(club.visits.get(march)?.placeId).toBeNull();
  });

  test("a database failure logs the pick id and not the token or the venue name", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const signed = token({ label: "The Ruby, Seattle", latitude: 47.615, longitude: -122.33, providerId: rubyId });
    const store: PlaceSelectionStore = {
      async findVisit() {
        return { id: "visit-march", pickId: "pick-march", enteredName: "The Ruby", placeId: null };
      },
      async saveConfirmedPlace() {
        throw new Error(`postgres://user:secret@localhost/db ${signed} The Ruby`);
      },
      async clearPlace() {
        throw new Error("postgres://user:secret@localhost/db The Ruby");
      },
    };

    try {
      await expect(confirmPlaceSelection({ month: march, token: signed }, writeOptions(store))).resolves.toEqual({
        status: "error",
      });
      await expect(clearPlaceSelection({ month: march }, writeOptions(store))).resolves.toEqual({ status: "error" });
      const logged = JSON.stringify(error.mock.calls);
      expect(logged).toContain("pick-march");
      expect(logged).not.toContain(signed);
      expect(logged).not.toContain("The Ruby");
      expect(logged).not.toContain("postgres://");
    } finally {
      error.mockRestore();
    }
  });
});

describe("the meeting tab does not choose a place", () => {
  test("saving the meeting's words does not reference visits, places, or the geocoder", () => {
    const meeting = readFileSync(new URL("../meeting-records.ts", import.meta.url), "utf8");
    const action = readFileSync(new URL("../../app/edit/meeting-actions.ts", import.meta.url), "utf8");
    const form = readFileSync(new URL("../../app/edit/meeting-form.tsx", import.meta.url), "utf8");
    const selection = readFileSync(new URL("./selection.ts", import.meta.url), "utf8");

    expect(meeting).not.toMatch(/\bvisits\b|\bplaces\b|placeId|enteredName|geoapify/i);
    expect(action).not.toMatch(/confirmPlaceSelection|searchPlacesForRecordKeeper|geoapify/i);
    expect(form).not.toMatch(/Find this place|Powered by Geoapify|name="candidate"|geoapify/i);
    expect(selection.match(/requireRecordKeeper\(/g)).toHaveLength(2);
    expect(selection).not.toMatch(/\bfetch\s*\(|GEOAPIFY_API_KEY|residential|detectHome/);
  });
});
