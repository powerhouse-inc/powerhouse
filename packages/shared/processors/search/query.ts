import { sql, type Kysely } from "kysely";
import type { SearchDB } from "./schema.js";

export interface SearchResult {
  document_id: string;
  document_type: string;
  title: string;
  rank: number;
}

export function createSearchQuery(db: Kysely<SearchDB>) {
  return {
    search(term: string, limit = 20): Promise<SearchResult[]> {
      return sql<SearchResult>`
        SELECT
          document_id,
          document_type,
          title,
          ts_rank(tsv, plainto_tsquery('english', ${term})) AS rank
        FROM search_index
        WHERE tsv @@ plainto_tsquery('english', ${term})
        ORDER BY rank DESC
        LIMIT ${limit}
      `
        .execute(db)
        .then((r) => r.rows);
    },
  };
}
