import { ts } from "@tmpl/core";

export const relationalDbSchemaTemplate = () =>
  ts`
export interface DocumentsTable {
  document_id: string;
  document_type: string;
  updated_at: string;
}

export interface DB {
  documents: DocumentsTable;
}
`.raw;
