import { NO_UPCOMING_MEETING, type MeetingView } from "@/lib/meeting";
import type { BookHero, FeaturedPickState, PromptHero } from "@/lib/picks";

const MARK_SRC = "/paperback-riders-mark.jpg";

export function PublicPage({ featured, meeting }: { featured: FeaturedPickState; meeting: MeetingView }) {
  return (
    <>
      <header className="brand">
        <div className="logo">
          {/* The mark is a local illustration. A plain img does not send it through the optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK_SRC} alt="" />
          <h1>
            Paperback
            <br /> Riders
          </h1>
        </div>
      </header>
      <main>
        {featured.status === "error" ? (
          <p role="alert">This page could not load.</p>
        ) : (
          <section aria-label="This month's pick">
            {featured.status === "ready" ? <Hero pickLabel={featured.pickLabel} hero={featured.hero} /> : null}
            <Dateline meeting={meeting} />
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
