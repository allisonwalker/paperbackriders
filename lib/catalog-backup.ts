/** Tables that make up the club catalog. Auth tables are not part of this backup check. */
export const CATALOG_TABLES = ["picks", "meetings", "places", "visits"] as const;

export type CatalogTable = (typeof CATALOG_TABLES)[number];

export type CatalogCounts = Record<CatalogTable, number>;

/** True when every catalog table has the same whole-number count on both sides. */
export function catalogCountsMatch(source: CatalogCounts, restored: CatalogCounts): boolean {
  return CATALOG_TABLES.every((table) => wholeCount(source[table]) && source[table] === restored[table]);
}

function wholeCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}
