export const OPEN_LIBRARY_COVER_HOST = "covers.openlibrary.org";

export function displayCoverUrl(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") {
    return null;
  }

  if (url.hostname !== OPEN_LIBRARY_COVER_HOST) {
    return null;
  }

  return url.toString();
}
