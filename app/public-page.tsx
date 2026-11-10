import { UNSELECTED_PICK } from "@/lib/current-pick";
import { NO_UPCOMING_MEETING, type MeetingView } from "@/lib/meeting";
import type { BookHero, FeaturedPickState, HistoryEntry, HistoryState, PromptHero } from "@/lib/picks";
import { PublicMasthead } from "./public-masthead";

export function PublicPage({
  featured,
  meeting,
  history,
}: {
  featured: FeaturedPickState;
  meeting: MeetingView;
  history: HistoryState;
}) {
  return (
    <>
      <PublicMasthead current="catalog" />
      <main>
        {featured.status === "error" || history.status === "error" ? (
          <p role="alert">This page could not load.</p>
        ) : (
          <section aria-label="Current pick">
            {featured.status === "ready" ? <Hero pickLabel={featured.pickLabel} hero={featured.hero} /> : null}
            {featured.status === "unselected" ? <h2>{UNSELECTED_PICK}</h2> : null}
            <Dateline meeting={meeting} />
            <History entries={history.entries} />
          </section>
        )}
      </main>
    </>
  );
}

function Hero({ pickLabel, hero }: { pickLabel: string; hero: BookHero | PromptHero }) {
  if (hero.kind === "prompt") {
    return (
      <>
        <p className="kicker">{pickLabel}</p>
        <h2>{hero.promptText}</h2>
      </>
    );
  }

  return (
    <div className="spread">
      <div className="cover-column">
        <p className="kicker">{pickLabel}</p>
        {hero.coverUrl ? (
          // Only an https covers.openlibrary.org URL reaches this img, so no other host is fetched.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.coverUrl} alt={hero.title ? "" : "Book cover"} />
        ) : null}
      </div>
      <div>
        {hero.title ? <h2>{hero.title}</h2> : null}
        {hero.author ? <p className="byline">{hero.author}</p> : null}
        <BookFacts hero={hero} />
      </div>
    </div>
  );
}

function Dateline({ meeting }: { meeting: MeetingView }) {
  if (meeting.status === "none") {
    return <p className="dateline">{NO_UPCOMING_MEETING}</p>;
  }

  if (meeting.status === "unscheduled") {
    return (
      <p className="dateline">
        <strong>{meeting.lead}</strong>
        <span>discussing {meeting.discussing}</span>
      </p>
    );
  }

  return (
    <p className="dateline">
      <strong>{meeting.lead}</strong>
      <span>
        {meeting.dateLabel}, {meeting.timeLabel}
      </span>
      <span>
        {meeting.place} · discussing {meeting.discussing}
      </span>
    </p>
  );
}

function History({ entries }: { entries: HistoryEntry[] }) {
  return (
    <section className="shelf" aria-label="Reading history">
      <h3>What we’ve read</h3>
      <ol className="bib">
        {entries.map((entry) =>
          entry.kind === "prompt" ? (
            <li key={entry.entryKey} className={entry.marked ? "now" : undefined} aria-current={entry.marked ? "true" : undefined}>
              <span className="jacket" />
              <span className="when">{entry.monthLabel}</span>
              <em className="prompt-line">{entry.promptText}</em>
            </li>
          ) : (
            <li key={entry.entryKey} className={entry.marked ? "now" : undefined} aria-current={entry.marked ? "true" : undefined}>
              <span className="jacket">
                {entry.coverUrl ? (
                  // Only an https covers.openlibrary.org URL, or the club's own Wicker Husband file, reaches this img.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.coverUrl} alt="" />
                ) : null}
              </span>
              <span className="when">{entry.monthLabel}</span>
              <span className="work">
                <span className="title">{entry.title}</span>
                <span className="author">{entry.author}</span>
              </span>
              <span className="facts">
                {entry.pageCount != null ? <span className="pages">{entry.pageCount} pages</span> : null}
                {entry.genre ? <span className="genre">{entry.genre}</span> : null}
              </span>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

function BookFacts({ hero }: { hero: BookHero }) {
  const facts = [
    hero.publishedYear != null ? String(hero.publishedYear) : null,
    hero.pageCount != null ? `${hero.pageCount} pages` : null,
    hero.genre,
  ].filter((fact): fact is string => fact != null);

  if (facts.length === 0) {
    return null;
  }

  return <p className="meta">{facts.join(" · ")}</p>;
}
