import { ts } from "@tmpl/core";

export const documentModelIndexTemplate = ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
export * from "./gen/index.js";
export * from "./src/index.js";
export * from "./hooks.js";
export * from "./module.js";
export { actions } from "./actions.js";
export { utils } from "./utils.js";
`.raw;
