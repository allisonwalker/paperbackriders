import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import {
  isTileFailure,
  mountMeetingMap,
  OPENFREEMAP_STYLE_URL,
  type MeetingMapHandlers,
  type MeetingMapInstance,
  type MeetingMapLibrary,
} from "./meeting-map";
import type { MeetingPin } from "./visits";

const pin: MeetingPin = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "The Ruby <img src=x onerror=alert(1)>",
  latitude: 47.61,
  longitude: -122.33,
  visits: [
    {
      kind: "book",
      month: "2026-11-01",
      monthLabel: "November 2026",
      title: "Piranesi",
      author: "Susanna Clarke",
      coverUrl: "https://covers.openlibrary.org/b/id/42-L.jpg",
    },
  ],
};

function handlers(): MeetingMapHandlers {
  return {
    onHover: vi.fn(),
    onFocus: vi.fn(),
    onSelect: vi.fn(),
    onFailure: vi.fn(),
  };
}

class FakeElement {
  type = "";
  className = "";
  textContent = "";
  children: FakeElement[] = [];
  listeners = new Map<string, Array<() => void>>();
  ownerDocument: { createElement: (tag: string) => FakeElement } | null = null;

  constructor(readonly tag: string) {}

  append(child: FakeElement) {
    this.children.push(child);
  }

  addEventListener(type: string, listener: () => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  set innerHTML(_value: string) {
    throw new Error("innerHTML");
  }
}

function installDocument() {
  const created: FakeElement[] = [];
  const ownerDocument = {
    createElement(tag: string) {
      const element = new FakeElement(tag);
      created.push(element);
      return element;
    },
  };
  const container = new FakeElement("div");
  container.ownerDocument = ownerDocument;
  return { container: container as unknown as HTMLElement, created };
}

class FakeMap implements MeetingMapInstance {
  static maps: FakeMap[] = [];
  listeners = new Map<string, Array<(event: { error?: unknown }) => void>>();
  removed = false;

  constructor(readonly options: { container: HTMLElement; style: string; attributionControl?: unknown }) {
    FakeMap.maps.push(this);
  }

  on(type: "load" | "error", listener: (event: { error?: unknown }) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  emit(type: "load" | "error", event: { error?: unknown } = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  fitBounds() {
    return undefined;
  }

  remove() {
    this.removed = true;
  }
}

function library(): MeetingMapLibrary {
  return {
    Map: FakeMap as unknown as MeetingMapLibrary["Map"],
    Marker: class {
      constructor(readonly options: { element: HTMLButtonElement; anchor: "center" }) {}
      setLngLat(lngLat: [number, number]) {
        void lngLat;
        return { addTo() { return undefined; } };
      }
    } as unknown as MeetingMapLibrary["Marker"],
    LngLatBounds: class {
      extend(lngLat: [number, number]) {
        void lngLat;
        return this;
      }
    } as unknown as MeetingMapLibrary["LngLatBounds"],
  };
}

describe("meeting map", () => {
  test("asks OpenFreeMap for the liberty style and leaves attribution on", async () => {
    FakeMap.maps = [];
    const { container } = installDocument();

    await mountMeetingMap(container, [pin], handlers(), library());

    expect(FakeMap.maps).toHaveLength(1);
    expect(FakeMap.maps[0]?.options.style).toBe("https://tiles.openfreemap.org/styles/liberty");
    expect(FakeMap.maps[0]?.options).not.toHaveProperty("attributionControl");
    expect(OPENFREEMAP_STYLE_URL).not.toMatch(/[?&](key|token)=/i);
  });

  test("puts the place label in a text node and reports a tile failure", async () => {
    FakeMap.maps = [];
    const { container, created } = installDocument();
    const mapHandlers = handlers();

    await mountMeetingMap(container, [pin], mapHandlers, library());
    FakeMap.maps[0]?.emit("load");

    const name = created.find((element) => element.className === "meeting-pin-name");
    const button = created.find((element) => element.className === "meeting-pin");
    expect(name?.textContent).toBe("The Ruby <img src=x onerror=alert(1)>");
    button?.listeners.get("mouseenter")?.[0]?.();
    button?.listeners.get("click")?.[0]?.();
    expect(mapHandlers.onHover).toHaveBeenCalledWith(pin.id);
    expect(mapHandlers.onSelect).toHaveBeenCalledWith(pin.id);

    FakeMap.maps[0]?.emit("error", { error: new Error("Failed to fetch tile") });
    expect(mapHandlers.onFailure).toHaveBeenCalledOnce();
  });

  test("a style error before the map loads is a failure, and an unrelated error after load is not", () => {
    expect(isTileFailure(new Error("ajax"), false)).toBe(true);
    expect(isTileFailure(new Error("something else"), true)).toBe(false);
    expect(isTileFailure(new Error("tile request failed"), true)).toBe(true);
  });

  test("the map module does not build popups from HTML", () => {
    const source = readFileSync(new URL("./meeting-map.ts", import.meta.url), "utf8");
    const view = readFileSync(new URL("../app/analytics/meeting-map.tsx", import.meta.url), "utf8");

    for (const file of [source, view]) {
      expect(file).not.toMatch(/innerHTML|setHTML|setDOMContent|dangerouslySetInnerHTML|\bPopup\b/);
    }
    expect(source).toContain("textContent");
    expect(source).toContain("setWorkerUrl");
    expect(source).toContain("maplibre-gl-worker.mjs");
    expect(view).toContain("<PinCovers");
    expect(view).toContain("<PinVisits");
    expect(view).not.toMatch(/dangerouslySetInnerHTML|marked\(|markdown/);
  });
});
