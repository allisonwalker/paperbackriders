import type { MeetingPin } from "./visits";

export const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export const MAP_LOAD_ERROR = "The map could not load.";

export const NO_PLACES_MESSAGE = "No places are confirmed yet.";

type MapListener = (event: { error?: unknown }) => void;

export type MeetingMapInstance = {
  on(type: "load" | "error", listener: MapListener): void;
  fitBounds(bounds: unknown, options: { padding: number; maxZoom: number; duration: number }): void;
  remove(): void;
};

export type MeetingMapOptions = {
  container: HTMLElement;
  style: string;
  attributionControl?: false | object;
};

export type MeetingMapLibrary = {
  Map: new (options: MeetingMapOptions) => MeetingMapInstance;
  Marker: new (options: { element: HTMLButtonElement; anchor: "center" }) => {
    setLngLat(lngLat: [number, number]): { addTo(map: MeetingMapInstance): void };
  };
  LngLatBounds: new () => { extend(lngLat: [number, number]): unknown };
};

export type MeetingMapHandlers = {
  onHover: (placeId: string | null) => void;
  onFocus: (placeId: string | null) => void;
  onSelect: (placeId: string) => void;
  onFailure: () => void;
};

export function placeButton(documentRef: Document, label: string): HTMLButtonElement {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "meeting-pin";
  const name = documentRef.createElement("span");
  name.className = "meeting-pin-name";
  name.textContent = label;
  button.append(name);
  return button;
}

export function isTileFailure(error: unknown, styleLoaded: boolean): boolean {
  if (!styleLoaded) {
    return true;
  }
  const message = error instanceof Error ? error.message : "";
  return /tile|style|ajax|sprite|glyph|source|fetch|network/i.test(message);
}

export async function mountMeetingMap(
  container: HTMLElement,
  pins: readonly MeetingPin[],
  handlers: MeetingMapHandlers,
  library?: MeetingMapLibrary,
): Promise<{ destroy: () => void }> {
  const maplibre = library ?? (await loadMapLibre());
  const map = new maplibre.Map({
    container,
    style: OPENFREEMAP_STYLE_URL,
  });

  let styleLoaded = false;
  let failed = false;
  const fail = () => {
    if (failed) {
      return;
    }
    failed = true;
    handlers.onFailure();
  };

  map.on("error", (event) => {
    if (isTileFailure(event.error, styleLoaded)) {
      const message = event.error instanceof Error ? event.error.message : "Unknown map error";
      console.error("meeting map failed", message);
      fail();
    }
  });

  map.on("load", () => {
    if (failed) {
      return;
    }
    try {
      styleLoaded = true;
      const bounds = new maplibre.LngLatBounds();
      for (const pin of pins) {
        bounds.extend([pin.longitude, pin.latitude]);
        const button = placeButton(container.ownerDocument, pin.label);
        button.addEventListener("mouseenter", () => handlers.onHover(pin.id));
        button.addEventListener("mouseleave", () => handlers.onHover(null));
        button.addEventListener("focus", () => handlers.onFocus(pin.id));
        button.addEventListener("blur", () => handlers.onFocus(null));
        button.addEventListener("click", () => handlers.onSelect(pin.id));
        new maplibre.Marker({ element: button, anchor: "center" })
          .setLngLat([pin.longitude, pin.latitude])
          .addTo(map);
      }
      map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
    } catch {
      fail();
    }
  });

  return {
    destroy() {
      map.remove();
    },
  };
}

async function loadMapLibre(): Promise<MeetingMapLibrary> {
  await import("maplibre-gl/dist/maplibre-gl.css");
  const maplibre = await import("maplibre-gl");
  // The bundled chunk's address is not next to the worker file, so point at the real one.
  const workerUrl = new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url);
  maplibre.setWorkerUrl(workerUrl.toString());
  return maplibre as unknown as MeetingMapLibrary;
}
