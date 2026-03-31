import { ts } from "@tmpl/core";

export const analyticsIndexTemplate = ts`
export * from "./factory.js";
export * from "./processor.js";
`.raw;
