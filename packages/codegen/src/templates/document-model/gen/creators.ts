import type { ModuleSpecification } from "@powerhousedao/shared";
import { ts } from "@tmpl/core";
import { camelCase, kebabCase } from "change-case";
import type { DocumentModelFileMakerArgs } from "file-builders";

function buildModuleCreatorsExport(
  module: ModuleSpecification,
  camelCaseDocumentType: string,
) {
  const kebabCaseModuleName = kebabCase(module.name);
  const camelCaseModuleName = camelCase(module.name);
  const namespaceName = `${camelCaseDocumentType}${camelCaseModuleName.charAt(0).toUpperCase()}${camelCaseModuleName.slice(1)}Actions`;
  const moduleCreatorsExport = `export * from "./${kebabCaseModuleName}/creators.js";`;
  const moduleCreatorsNamespaceExport = `export * as ${namespaceName} from "./${kebabCaseModuleName}/creators.js";`;

  return [moduleCreatorsExport, moduleCreatorsNamespaceExport];
}
function buildCreatorsExports(
  modules: ModuleSpecification[],
  camelCaseDocumentType: string,
) {
  return modules
    .flatMap((module) =>
      buildModuleCreatorsExport(module, camelCaseDocumentType),
    )
    .join("\n");
}
export const documentModelGenCreatorsFileTemplate = (
  v: DocumentModelFileMakerArgs,
) =>
  ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
${buildCreatorsExports(v.specification.modules, v.camelCaseDocumentType)}
`.raw;
