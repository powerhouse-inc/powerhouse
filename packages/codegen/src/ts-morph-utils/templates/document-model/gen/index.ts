import { ts } from "@tmpl/core";
import { paramCase } from "change-case";
import type { ModuleSpecification } from "document-model";
import type { DocumentModelVariableNames } from "../../../name-builders/types.js";

function buildModuleOperationsExports(module: ModuleSpecification) {
  const moduleDirName = paramCase(module.name);
  return `export * from "./${moduleDirName}/operations.js";`;
}

function buildModulesOperationsExports(modules: ModuleSpecification[]) {
  return modules.map(buildModuleOperationsExports).join("\n");
}

export const documentModelGenIndexFileTemplate = (
  v: DocumentModelVariableNames,
) =>
  ts`
export * from './actions.js';
export * from './document-model.js';
export * from './types.js';
export * from './creators.js';
export {
  create${v.phDocumentTypeName},
  createState,
  defaultPHState,
  defaultGlobalState,
  defaultLocalState,
} from './ph-factories.js';
export * from "./utils.js";
export * from "./reducer.js";
export * from "./schema/index.js";
export * from "./document-type.js";
export * from "./document-schema.js";
${buildModulesOperationsExports(v.modules)}
`.raw;
