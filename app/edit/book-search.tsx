"use client";

import { useState, useTransition } from "react";
import { searchBooks } from "./lookup-action";
import { canSearchKind, SEARCH_QUERY_MAX, type BookMatch, type BookSearchState } from "@/lib/books/match";

export function BookSearch({
  getKind,
  onApply,
}: {
  getKind: () => string;
  onApply: (match: BookMatch) => void;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<BookSearchState | null>(null);
  const [pending, startTransition] = useTransition();

  function runSearch() {
    const kind = getKind();
    if (!canSearchKind(kind) || pending) return;
    if (query.trim() === "") {
      setState({ status: "blank" });
      return;
    }

    setState(null);
    startTransition(async () => {
      try {
        const next = await searchBooks(query, kind);
        if (!canSearchKind(getKind())) return;
        setState(next);
      } catch {
        setState({ status: "unavailable" });
      }
    });
  }

  return (
    <div className="book-search">
      <label htmlFor="book-search">Find a book</label>
      <input
        id="book-search"
        value={query}
        maxLength={SEARCH_QUERY_MAX}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="none"
        aria-describedby="book-search-hint"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          runSearch();
        }}
      />
      <p id="book-search-hint" className="hint">
        Choose a match to fill the form, or skip it and type the book yourself. Nothing is saved until you save the month.
      </p>
      <button type="button" className="secondary" disabled={pending || query.trim() === ""} onClick={runSearch}>
        {pending ? "Searching..." : "Search"}
      </button>
      <SearchStatus pending={pending} state={state} onApply={onApply} onDismiss={() => setState(null)} />
    </div>
  );
}

function SearchStatus({
  pending,
  state,
  onApply,
  onDismiss,
}: {
  pending: boolean;
  state: BookSearchState | null;
  onApply: (match: BookMatch) => void;
  onDismiss: () => void;
}) {
  if (pending) return <p role="status">Searching Open Library...</p>;
  if (!state || state.status === "skipped") return null;
  if (state.status === "matches") {
    return (
      <div>
        <p id="book-matches-label" role="status">
          {state.matches.length === 1
            ? "1 match. Choose it, or keep what you typed."
            : `${state.matches.length} matches. Choose one, or keep what you typed.`}
        </p>
        <ul className="match-list" aria-labelledby="book-matches-label">
          {state.matches.map((match) => (
            <li key={match.lookupKey}>
              <p className="match-title">{match.title}</p>
              <p className="hint">{matchLine(match)}</p>
              <button
                type="button"
                className="secondary"
                aria-label={`Use ${match.title} by ${match.author}`}
                onClick={() => onApply(match)}
              >
                Use this match
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="secondary" onClick={onDismiss}>
          Keep what I typed
        </button>
      </div>
    );
  }

  return <p role="status">{statusText(state.status)}</p>;
}

function matchLine(match: BookMatch): string {
  const parts = [match.author];
  if (match.publishedYear != null) parts.push(String(match.publishedYear));
  if (match.pageCount != null) parts.push(`${match.pageCount} pages`);
  if (match.genre) parts.push(match.genre);
  return parts.join(" · ");
}

function statusText(status: Exclude<BookSearchState["status"], "matches" | "skipped">): string {
  if (status === "blank") return "Enter a title or an author to search.";
  if (status === "too-long") return "Search for a shorter title or author. You can still type the book and save it.";
  if (status === "empty") return "No matches came back. You can still type the book and save it.";
  if (status === "forbidden") return "You need to be signed in as the record keeper.";
  return "Open Library didn't respond. You can still type the book and save it.";
}
