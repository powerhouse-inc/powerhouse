import { ts } from "@tmpl/core";

export const documentModelSchemaIndexTemplate = ts`
export * from "./types.js";
export * from "./zod.js";
`.raw;
