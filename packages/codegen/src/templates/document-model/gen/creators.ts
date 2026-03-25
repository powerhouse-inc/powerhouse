import type { DocumentModelTemplateInputs } from "@powerhousedao/codegen/file-builders";
import { ts } from "@tmpl/core";
import { camelCase, kebabCase } from "change-case";
import type { ModuleSpecification } from "@powerhousedao/shared";

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
  v: DocumentModelTemplateInputs,
) =>
  ts`
${buildCreatorsExports(v.modules, v.camelCaseDocumentType)}
`.raw;
