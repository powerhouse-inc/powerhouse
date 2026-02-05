import { ts } from "@tmpl/core";

export const relationalDbSchemaTemplate = () =>
  ts`
export interface Todo {
  status: boolean | null;
  task: string;
}

export interface DB {
  todo: Todo;
}
`.raw;
