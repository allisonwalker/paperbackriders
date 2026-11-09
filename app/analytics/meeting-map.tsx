"use client";

import { useEffect, useRef, useState } from "react";
import { MAP_LOAD_ERROR, mountMeetingMap, NO_PLACES_MESSAGE } from "@/lib/meeting-map";
import type { MeetingPin, PinsState } from "@/lib/visits";

export function MeetingMap({ pins }: { pins: PinsState }) {
  const [failed, setFailed] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ready = pins.status === "ready" ? pins.pins : [];
  const hovered = ready.find((pin) => pin.id === (hoveredId ?? focusedId)) ?? null;
  const selected = ready.find((pin) => pin.id === selectedId) ?? null;
  const showMap = pins.status === "ready" && pins.pins.length > 0 && !failed;

  useEffect(() => {
    if (!showMap) {
      return;
    }
    const container = containerRef.current;
    if (!container || pins.status !== "ready") {
      return;
    }

    let session: { destroy: () => void } | undefined;
    let cancelled = false;
    mountMeetingMap(container, pins.pins, {
      onHover: setHoveredId,
      onFocus: setFocusedId,
      onSelect: (placeId) => {
        setSelectedId((current) => (current === placeId ? null : placeId));
      },
      onFailure: () => setFailed(true),
    })
      .then((created) => {
        if (cancelled) {
          created.destroy();
          return;
        }
        session = created;
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      session?.destroy();
    };
  }, [pins, showMap]);

  return (
    <section aria-label="Meeting places" className="meeting-places">
      {pins.status === "error" || failed ? (
        <p role="alert">{MAP_LOAD_ERROR}</p>
      ) : pins.pins.length === 0 ? (
        <p>{NO_PLACES_MESSAGE}</p>
      ) : (
        <div className="meeting-map-frame">
          <div ref={containerRef} className="meeting-map" />
          {hovered ? <PinCovers pin={hovered} /> : null}
          {selected ? <PinVisits pin={selected} /> : null}
        </div>
      )}
      <p className="map-credit">
        <a href="https://www.geoapify.com/">Powered by Geoapify</a>
      </p>
    </section>
  );
}

export function PinCovers({ pin }: { pin: MeetingPin }) {
  const covers = pin.visits.flatMap((visit) =>
    visit.kind === "book" && visit.coverUrl
      ? [{ month: visit.month, url: visit.coverUrl, title: visit.title }]
      : [],
  );

  return (
    <div className="pin-hover">
      <p className="pin-label">{pin.label}</p>
      {covers.length > 0 ? (
        <div className="pin-covers">
          {covers.map((cover) => (
            // Only an https covers.openlibrary.org URL reaches this img, so no other host is fetched.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={cover.month} src={cover.url} alt={cover.title} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PinVisits({ pin }: { pin: MeetingPin }) {
  return (
    <div className="pin-visits">
      <p className="pin-label">{pin.label}</p>
      <ol>
        {pin.visits.map((visit) => (
          <li key={visit.month}>
            {visit.kind === "book" ? (
              <>
                <span className="visit-title">{visit.title}</span>
                <span className="visit-author">{visit.author}</span>
              </>
            ) : (
              <span className="visit-prompt">{visit.promptText}</span>
            )}
            <span className="visit-month">{visit.monthLabel}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
