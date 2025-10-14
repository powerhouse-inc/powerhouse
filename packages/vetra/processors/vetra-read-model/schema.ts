import type { ColumnType } from "kysely";

export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>;

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface VetraPackage {
  author_name: string | null;
  author_website: string | null;
  category: string | null;
  created_at: Generated<Timestamp>;
  description: string | null;
  document_id: string;
  github_url: string | null;
  keywords: string | null;
  last_operation_hash: string;
  last_operation_index: number;
  last_operation_timestamp: Timestamp;
  name: string | null;
  npm_url: string | null;
  updated_at: Generated<Timestamp>;
  drive_id: string | null;
}

export interface DB {
  vetra_package: VetraPackage;
}
