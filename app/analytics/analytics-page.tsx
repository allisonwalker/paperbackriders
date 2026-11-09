import Link from "next/link";
import type { ReadingState } from "@/lib/reading";

export function AnalyticsPage({ reading }: { reading: ReadingState }) {
  return (
    <>
      <header className="analytics-banner">
        <p className="kicker">
          <Link href="/">Paperback Riders</Link>
        </p>
        <h1>Book analytics</h1>
      </header>
      <main>
        {reading.status === "error" ? (
          <p role="alert">This page could not load.</p>
        ) : (
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
        )}
      </main>
    </>
  );
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
