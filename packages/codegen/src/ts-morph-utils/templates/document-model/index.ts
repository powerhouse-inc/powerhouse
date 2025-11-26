import { ts } from "@tmpl/core";

export const documentModelIndexTemplate = ts`
export * from "./gen/index.js";
export * from "./src/index.js";
export * from "./hooks.js";
export { actions } from "./actions.js";
export { utils } from "./utils.js";
`.raw;
