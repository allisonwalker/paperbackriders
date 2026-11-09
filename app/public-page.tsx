import { LOGO_FILE_NAME } from "@/lib/logo";
import type { BookHero, FeaturedPickState, PromptHero } from "@/lib/picks";

export function PublicPage({
  state,
  showLogo,
}: {
  state: FeaturedPickState;
  showLogo: boolean;
}) {
  return (
    <>
      <header className="brand">
        <div className="logo">
          {showLogo ? (
            // The file name is fixed. A plain img does not send this local file through the optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/${LOGO_FILE_NAME}`} alt="Paperback Riders" />
          ) : null}
          <h1>
            Paperback
            <br /> Riders
          </h1>
        </div>
      </header>
      <main>
        {state.status === "error" ? (
          <p role="alert">This page could not load.</p>
        ) : (
          <section aria-label="This month's pick">
            {state.status === "ready" ? <Hero hero={state.hero} /> : null}
          </section>
        )}
      </main>
    </>
  );
}

function Hero({ hero }: { hero: BookHero | PromptHero }) {
  if (hero.kind === "prompt") {
    return (
      <>
        <p className="kicker">{hero.monthLabel}</p>
        <h2>{hero.promptText}</h2>
      </>
    );
  }

  return (
    <>
      <p className="kicker">{hero.monthLabel}</p>
      <div className="spread">
        {hero.coverUrl ? (
          // Only an https covers.openlibrary.org URL reaches this img, so no other host is fetched.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.coverUrl} alt={hero.title ? "" : "Book cover"} />
        ) : null}
        <div>
          {hero.title ? <h2>{hero.title}</h2> : null}
          {hero.author ? <p className="byline">{hero.author}</p> : null}
          <BookFacts hero={hero} />
        </div>
      </div>
    </>
  );
}

function BookFacts({ hero }: { hero: BookHero }) {
  const publishedYear = hero.publishedYear;
  const pageCount = hero.pageCount;
  const genre = hero.genre;
  if (publishedYear == null && pageCount == null && genre == null) {
    return null;
  }

  return (
    <ul>
      {publishedYear != null ? <li>{publishedYear}</li> : null}
      {pageCount != null ? <li>{pageCount} pages</li> : null}
      {genre != null ? <li>{genre}</li> : null}
    </ul>
  );
}
