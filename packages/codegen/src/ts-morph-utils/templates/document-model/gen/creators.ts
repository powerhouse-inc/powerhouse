import { ts } from "@tmpl/core";
import { camelCase, paramCase } from "change-case";
import type { ModuleSpecification } from "document-model";
import type { DocumentModelTemplateInputs } from "../../../name-builders/types.js";

function buildModuleCreatorsExport(module: ModuleSpecification) {
  const paramCaseModuleName = paramCase(module.name);
  const camelCaseModuleName = camelCase(module.name);
  const moduleCreatorsExport = `export * from "./${paramCaseModuleName}/creators.js";`;
  const moduleCreatorsNamespaceExport = `export * as ${camelCaseModuleName}Actions from "./${paramCaseModuleName}/creators.js";`;

  return [moduleCreatorsExport, moduleCreatorsNamespaceExport];
}
function buildCreatorsExports(modules: ModuleSpecification[]) {
  return modules.flatMap(buildModuleCreatorsExport).join("\n");
}
export const documentModelGenCreatorsFileTemplate = (
  v: DocumentModelTemplateInputs,
) =>
  ts`
${buildCreatorsExports(v.modules)}
`.raw;
