export const OPEN_LIBRARY_COVER_HOST = "covers.openlibrary.org";

/** A cover file on this site. It is not fetched from another host. */
export const WICKER_HUSBAND_COVER = "/covers/the-wicker-husband.png";

export function displayCoverUrl(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed === WICKER_HUSBAND_COVER) {
    return trimmed;
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

/** A list thumbnail. The stored cover stays the large file used on the featured pick. */
export function historyCoverUrl(value: string | null | undefined): string | null {
  const url = displayCoverUrl(value);
  if (!url) return null;
  if (url === WICKER_HUSBAND_COVER) return url;
  return url.replace(/\/b\/id\/(\d+)-L\.jpg(?=[?#]|$)/, "/b/id/$1-M.jpg");
}
