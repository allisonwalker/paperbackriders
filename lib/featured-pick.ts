import { isMonthStart } from "./club-date";

export function selectFeaturedPick<T extends { month: string }>(
  rows: readonly T[],
  currentMonth: string,
): T | null {
  if (!isMonthStart(currentMonth)) {
    throw new Error("The current club month must be the first calendar day");
  }

  let featured: T | null = null;
  for (const row of rows) {
    if (!isMonthStart(row.month) || row.month > currentMonth) {
      continue;
    }
    if (featured === null || row.month > featured.month) {
      featured = row;
    }
  }

  return featured;
}
