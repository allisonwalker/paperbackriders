import { PLACE_LIMIT } from "../meeting-copy";
import { requireRecordKeeper, RecordKeeperRequiredError, type SessionEmail } from "../record-keeper";
import { normalizeMonth } from "../validation";
import { readStoredVenue } from "../visit-records";
import { signPlaceCandidate } from "./candidate";

/**
 * Geoapify forward geocoding for one stored venue name.
 * The request URL is built here. A venue name never becomes the host, and the key never leaves the server.
 * Search does not write a place. One result is still a list the record keeper has to choose.
 */

export const GEOAPIFY_GEOCODE_ORIGIN = "https://api.geoapify.com";
export const GEOAPIFY_GEOCODE_PATH = "/v1/geocode/search";

const RESULT_LIMIT = 5;
const FEATURE_SCAN_LIMIT = 20;
const MAX_BODY_BYTES = 256_000;
const SEARCH_TIMEOUT_MS = 8_000;
const PROVIDER_ID = /^[a-f0-9]{16,512}$/i;
const COORDINATE_TOLERANCE = 0.0001;
const BIAS_PAIR = /^(-?\d+(?:\.\d+)?)[ \t]*,[ \t]*(-?\d+(?:\.\d+)?)$/;

export type PlaceEnv = {
  GEOAPIFY_API_KEY?: string;
  CLUB_PLACE_BIAS?: string;
  BETTER_AUTH_SECRET?: string;
};

export type StoredVenueQuery = {
  pickId: string;
  enteredName: string;
};

export type SignedPlaceCandidate = {
  token: string;
  label: string;
};

export type PlaceSearchState =
  | { status: "matches"; candidates: SignedPlaceCandidate[] }
  | { status: "empty" }
  | { status: "missing" }
  | { status: "unconfigured" }
  | { status: "forbidden" }
  | { status: "unavailable" };

export type PlaceSearchOptions = {
  readSession?: () => Promise<SessionEmail | null>;
  allowlisted?: string | null;
  fetch?: typeof fetch;
  env?: PlaceEnv;
  now?: () => number;
  readVisit?: (month: string) => Promise<StoredVenueQuery | null>;
};

type Bias = { latitude: number; longitude: number };

type UnsignedCandidate = {
  label: string;
  latitude: number;
  longitude: number;
  providerId: string;
};

export function isGeoapifyGeocodeUrl(url: URL): boolean {
  return (
    url.origin === GEOAPIFY_GEOCODE_ORIGIN &&
    url.pathname === GEOAPIFY_GEOCODE_PATH &&
    url.username === "" &&
    url.password === ""
  );
}

export function parseClubPlaceBias(value: string | undefined): Bias | null {
  if (typeof value !== "string") return null;
  const match = BIAS_PAIR.exec(value.trim());
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export async function searchPlacesForRecordKeeper(
  input: { month: unknown },
  options?: PlaceSearchOptions,
): Promise<PlaceSearchState> {
  try {
    await requireRecordKeeper(options?.readSession, options?.allowlisted);
  } catch (error) {
    if (error instanceof RecordKeeperRequiredError) return { status: "forbidden" };
    logSearchFailure();
    return { status: "unavailable" };
  }

  const month = normalizeMonth(input.month);
  if (!month) return { status: "missing" };

  const env = options?.env ?? process.env;
  const bias = parseClubPlaceBias(env.CLUB_PLACE_BIAS);
  const apiKey = env.GEOAPIFY_API_KEY?.trim() ?? "";
  const secret = env.BETTER_AUTH_SECRET?.trim() ?? "";
  if (!bias) return { status: "unconfigured" };
  if (!apiKey || !secret) return { status: "unavailable" };

  const now = readClock(options?.now);
  if (now == null) return { status: "unavailable" };

  let visit: StoredVenueQuery | null;
  try {
    visit = await (options?.readVisit ?? readStoredVenue)(month);
  } catch {
    logSearchFailure();
    return { status: "unavailable" };
  }

  if (!visit || !visit.enteredName.trim()) return { status: "missing" };

  return requestPlaces(visit.enteredName.trim(), visit.pickId, bias, apiKey, secret, now, options?.fetch ?? fetch);
}

async function requestPlaces(
  enteredName: string,
  pickId: string,
  bias: Bias,
  apiKey: string,
  secret: string,
  now: number,
  fetchImpl: typeof fetch,
): Promise<PlaceSearchState> {
  const requested = buildSearchUrl(enteredName, bias, apiKey);
  if (!requested || !isGeoapifyGeocodeUrl(requested) || requested.searchParams.has("filter")) {
    logSearchFailure(pickId);
    return { status: "unavailable" };
  }

  let response: Response;
  try {
    response = await fetchImpl(requested.toString(), {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/geo+json, application/json" },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch {
    logSearchFailure(pickId);
    return { status: "unavailable" };
  }

  if (!stayedOnGeocodeHost(response, requested) || response.status !== 200) {
    logSearchFailure(pickId, response.status);
    await discardBody(response);
    return { status: "unavailable" };
  }

  const body = await readLimitedText(response);
  if (body == null) {
    logSearchFailure(pickId, response.status);
    return { status: "unavailable" };
  }

  try {
    return candidatesFromPayload(JSON.parse(body), secret, now, pickId);
  } catch {
    logSearchFailure(pickId, response.status);
    return { status: "unavailable" };
  }
}

function buildSearchUrl(enteredName: string, bias: Bias, apiKey: string): URL | null {
  const url = new URL(GEOAPIFY_GEOCODE_PATH, GEOAPIFY_GEOCODE_ORIGIN);
  url.searchParams.set("text", enteredName);
  url.searchParams.set("limit", String(RESULT_LIMIT));
  url.searchParams.set("format", "geojson");
  url.searchParams.set("bias", `proximity:${bias.longitude},${bias.latitude}`);
  url.searchParams.set("apiKey", apiKey);
  return isGeoapifyGeocodeUrl(url) ? url : null;
}

function stayedOnGeocodeHost(response: Response, requested: URL): boolean {
  if (response.status >= 300 && response.status < 400) return false;
  if (response.url === "") return true;
  try {
    return isGeoapifyGeocodeUrl(new URL(response.url));
  } catch {
    return isGeoapifyGeocodeUrl(requested);
  }
}

function candidatesFromPayload(payload: unknown, secret: string, now: number, pickId: string): PlaceSearchState {
  if (payload == null || typeof payload !== "object" || !("features" in payload) || !Array.isArray(payload.features)) {
    logSearchFailure(pickId);
    return { status: "unavailable" };
  }

  const candidates: SignedPlaceCandidate[] = [];
  const seen = new Set<string>();
  for (const feature of payload.features.slice(0, FEATURE_SCAN_LIMIT)) {
    const match = candidateFromFeature(feature);
    if (!match || seen.has(match.providerId)) continue;
    seen.add(match.providerId);
    candidates.push({
      label: match.label,
      token: signPlaceCandidate(match, secret, now),
    });
    if (candidates.length === RESULT_LIMIT) break;
  }

  return candidates.length === 0 ? { status: "empty" } : { status: "matches", candidates };
}

function candidateFromFeature(feature: unknown): UnsignedCandidate | null {
  if (feature == null || typeof feature !== "object") return null;
  const record = feature as Record<string, unknown>;
  const geometry = record.geometry;
  const properties = record.properties;
  if (geometry == null || typeof geometry !== "object" || properties == null || typeof properties !== "object") return null;

  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const longitude = coordinates[0];
  const latitude = coordinates[1];
  if (!usableCoordinate(latitude, -90, 90) || !usableCoordinate(longitude, -180, 180)) return null;
  if (!propertiesAgree(properties as Record<string, unknown>, latitude, longitude)) return null;

  const providerId = readProviderId((properties as Record<string, unknown>).place_id);
  const label = fitLabel((properties as Record<string, unknown>).formatted) ?? fitLabel((properties as Record<string, unknown>).name);
  if (!providerId || !label) return null;
  return { label, latitude, longitude, providerId };
}

function propertiesAgree(properties: Record<string, unknown>, latitude: number, longitude: number): boolean {
  const propertyLatitude = properties.lat;
  const propertyLongitude = properties.lon;
  if (propertyLatitude == null && propertyLongitude == null) return true;
  if (!usableCoordinate(propertyLatitude, -90, 90) || !usableCoordinate(propertyLongitude, -180, 180)) return false;
  return Math.abs(propertyLatitude - latitude) <= COORDINATE_TOLERANCE && Math.abs(propertyLongitude - longitude) <= COORDINATE_TOLERANCE;
}

function readProviderId(value: unknown): string | null {
  if (typeof value !== "string" || !PROVIDER_ID.test(value)) return null;
  return value.toLowerCase();
}

function fitLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replaceAll(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > PLACE_LIMIT) return null;
  return cleaned;
}

function usableCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function readClock(now: (() => number) | undefined): number | null {
  try {
    const value = now ? now() : Date.now();
    return Number.isSafeInteger(value) ? value : null;
  } catch {
    return null;
  }
}

async function readLimitedText(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return text.length > MAX_BODY_BYTES ? null : text;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The failure is already reported. Dropping the unread body is best-effort.
  }
}

function logSearchFailure(pickId?: string, status?: number): void {
  const safeStatus = typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
  const details: { pickId?: string; status?: number } = {};
  if (pickId) details.pickId = pickId;
  if (safeStatus !== undefined) details.status = safeStatus;
  console.error("place search failed", details);
}
