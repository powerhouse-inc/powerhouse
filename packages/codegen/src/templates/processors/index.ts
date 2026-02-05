import { ts } from "@tmpl/core";

export const processorsIndexTemplate = () =>
  ts`
/**
 * Processor exports
 * This file is auto-generated and updated by codegen
 */

export { processorFactory } from "./factory.js";
`.raw;
