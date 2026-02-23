import type { DocumentModelTemplateInputs } from "@powerhousedao/codegen/file-builders";
import { ts } from "@tmpl/core";
import { camelCase, kebabCase } from "change-case";
import type { ModuleSpecification } from "document-model";

function buildModuleCreatorsExport(module: ModuleSpecification) {
  const kebabCaseModuleName = kebabCase(module.name);
  const camelCaseModuleName = camelCase(module.name);
  const moduleCreatorsExport = `export * from "./${kebabCaseModuleName}/creators.js";`;
  const moduleCreatorsNamespaceExport = `export * as ${camelCaseModuleName}Actions from "./${kebabCaseModuleName}/creators.js";`;

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
