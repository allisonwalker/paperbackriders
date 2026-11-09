"use server";

import { searchBooksForRecordKeeper } from "@/lib/books/lookup";
import type { BookSearchState } from "@/lib/books/match";

export async function searchBooks(query: string, kind: string): Promise<BookSearchState> {
  return searchBooksForRecordKeeper({ query, kind });
}
