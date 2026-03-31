import { ts } from "@tmpl/core";

export const relationalDbIndexTemplate = ts`
export * from "./factory.js";
export * from "./processor.js";
`.raw;
