import { historyCoverUrl } from "@/lib/cover";
import type { GenreTotal, ReadingState } from "@/lib/reading";
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
              <div className="totals-pair">
                <p className="total reading-frame">
                  <span className="total-value">{formatCount(reading.bookCount)}</span>
                  <span className="total-label">{reading.bookCount === 1 ? "book" : "books"}</span>
                </p>
                <p className="total reading-frame">
                  <span className="total-value">{formatCount(reading.pageTotal)}</span>
                  <span className="total-label">{reading.pageTotal === 1 ? "page" : "pages"}</span>
                </p>
              </div>
              <div className="genre-panel reading-frame">
                <h2 className="section-label">Genres</h2>
                {reading.genres.length === 0 ? (
                  <p>No genres.</p>
                ) : (
                  <ul className="genre-list">
                    {reading.genres.map((genre) => (
                      <li key={genre.label} aria-label={accessibleGenre(genre, reading.bookCount)}>
                        <span className="genre-name">{genre.label}</span>
                        <span className="genre-bar">
                          {genre.books.map((book, index) => {
                            const cover = historyCoverUrl(book.coverUrl);
                            return (
                              <span key={`${book.month}-${book.title}-${index}`} className="genre-tile">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {cover ? <img src={cover} alt="" /> : null}
                              </span>
                            );
                          })}
                        </span>
                        <span className="genre-count">{genreCountLabel(genre.count, reading.bookCount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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

function genrePercent(count: number, bookCount: number): number {
  if (bookCount <= 0) {
    return 0;
  }
  return Math.round((count / bookCount) * 100);
}

function genreCountLabel(count: number, bookCount: number): string {
  const noun = count === 1 ? "book" : "books";
  return `${formatCount(count)} ${noun} · ${genrePercent(count, bookCount)}%`;
}

function accessibleGenre(genre: GenreTotal, bookCount: number): string {
  const noun = genre.count === 1 ? "book" : "books";
  const titles = genre.books.map((book) => book.title.trim()).filter((title) => title.length > 0);
  return [genre.label, `${formatCount(genre.count)} ${noun}`, `${genrePercent(genre.count, bookCount)}%`, ...titles].join(
    ", ",
  );
}
