import { ts } from "@tmpl/core";

export const relationalDbSchemaTemplate = () =>
  ts`
export interface Todo {
  document_id: string;
  status: boolean | null;
  task: string;
}

export interface DB {
  todo: Todo;
}
`.raw;
