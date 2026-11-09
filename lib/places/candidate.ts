import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { PLACE_LIMIT } from "../meeting-copy";

/**
 * A place candidate the server signed.
 * The browser sends this token back. Coordinates are read from the token, not from other form fields.
 */

export const PLACE_PROVIDER = "geoapify";
export const PLACE_CANDIDATE_TTL_MS = 15 * 60 * 1000;

const TOKEN_VERSION = 1;
const CLOCK_SLACK_MS = 60_000;
const MAX_TOKEN_LENGTH = 8_000;
const PROVIDER_ID = /^[a-f0-9]{16,512}$/;

export type PlaceCandidateClaims = {
  label: string;
  latitude: number;
  longitude: number;
  provider: typeof PLACE_PROVIDER;
  providerId: string;
  exp: number;
};

type SignedClaims = PlaceCandidateClaims & { v: typeof TOKEN_VERSION };

export function signPlaceCandidate(
  claims: Omit<PlaceCandidateClaims, "exp" | "provider"> & { provider?: typeof PLACE_PROVIDER },
  secret: string,
  now: number,
): string {
  const signed: SignedClaims = {
    v: TOKEN_VERSION,
    label: claims.label,
    latitude: claims.latitude,
    longitude: claims.longitude,
    provider: PLACE_PROVIDER,
    providerId: claims.providerId,
    exp: now + PLACE_CANDIDATE_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(signed), "utf8").toString("base64url");
  const mac = createHmac("sha256", signingKey(secret)).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifyPlaceCandidate(token: unknown, secret: string, now: number): PlaceCandidateClaims | null {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  const separator = token.indexOf(".");
  if (separator <= 0 || separator !== token.lastIndexOf(".")) return null;
  const payload = token.slice(0, separator);
  const mac = token.slice(separator + 1);
  if (!payload || !mac || !macMatches(payload, mac, secret)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  return claimsFromPayload(parsed, now);
}

function claimsFromPayload(payload: unknown, now: number): PlaceCandidateClaims | null {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (record.v !== TOKEN_VERSION) return null;
  if (record.provider !== PLACE_PROVIDER) return null;
  if (typeof record.label !== "string" || !signedLabel(record.label)) return null;
  if (!signedCoordinate(record.latitude, -90, 90) || !signedCoordinate(record.longitude, -180, 180)) return null;
  if (typeof record.providerId !== "string" || !PROVIDER_ID.test(record.providerId)) return null;
  if (!safeInteger(record.exp) || record.exp <= now || record.exp > now + PLACE_CANDIDATE_TTL_MS + CLOCK_SLACK_MS) {
    return null;
  }

  return {
    label: record.label,
    latitude: record.latitude,
    longitude: record.longitude,
    provider: PLACE_PROVIDER,
    providerId: record.providerId,
    exp: record.exp,
  };
}

function signedLabel(label: string): boolean {
  if (!label || label.length > PLACE_LIMIT) return false;
  if (label !== label.trim()) return false;
  return !/[\u0000-\u001f\u007f]/.test(label);
}

function signedCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function macMatches(payload: string, mac: string, secret: string): boolean {
  const expected = createHmac("sha256", signingKey(secret)).update(payload).digest("base64url");
  const given = Buffer.from(mac);
  const actual = Buffer.from(expected);
  if (given.length !== actual.length) return false;
  return timingSafeEqual(given, actual);
}

function signingKey(secret: string): Buffer {
  return createHash("sha256").update("paperback-riders.place-candidate.v1").update("\0").update(secret).digest();
}
