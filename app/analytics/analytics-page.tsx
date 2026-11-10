import type { ReadingState } from "@/lib/reading";
import type { PinsState } from "@/lib/visits";
import { PublicMasthead } from "../public-masthead";
import { PublicNav } from "../public-nav";
import { MeetingMap } from "./meeting-map";

export function AnalyticsPage({ reading, pins }: { reading: ReadingState; pins: PinsState }) {
  return (
    <>
      <PublicMasthead />
      <main>
        <PublicNav current="analytics" />
        {reading.status === "error" ? (
          <p role="alert">This page could not load.</p>
        ) : (
          <>
            <section aria-label="Reading totals">
              <p className="total">
                <span className="total-value">{formatCount(reading.bookCount)}</span>
                <span className="total-label">{reading.bookCount === 1 ? "book" : "books"}</span>
              </p>
              <p className="total">
                <span className="total-value">{formatCount(reading.pageTotal)}</span>
                <span className="total-label">{reading.pageTotal === 1 ? "page" : "pages"}</span>
              </p>
              <h2 className="section-label">Genres</h2>
              {reading.genres.length === 0 ? (
                <p>No genres.</p>
              ) : (
                <ul className="genre-list">
                  {reading.genres.map((genre) => (
                    <li key={genre.label}>
                      <span className="genre-name">{genre.label}</span>
                      <span className="genre-count">
                        {formatCount(genre.count)} {genre.count === 1 ? "book" : "books"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <MeetingMap pins={pins} />
          </>
        )}
      </main>
    </>
  );
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
