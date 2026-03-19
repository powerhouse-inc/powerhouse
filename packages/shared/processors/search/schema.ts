import type { ColumnType } from "kysely";

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface SearchIndex {
  document_id: string;
  document_type: string;
  title: string;
  content: string;
  updated_at: Timestamp;
}

export interface SearchDB {
  search_index: SearchIndex;
}
