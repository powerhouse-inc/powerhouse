import type { DocumentModelTemplateInputs } from "@powerhousedao/codegen/file-builders";
import { ts } from "@tmpl/core";
import { camelCase } from "change-case";
import type { ModuleSpecification } from "@powerhousedao/shared/document-model";

function buildModuleActionsName(
  module: ModuleSpecification,
  camelCaseDocumentType: string,
) {
  const camelCaseModuleName = camelCase(module.name);
  return `${camelCaseDocumentType}${camelCaseModuleName.charAt(0).toUpperCase()}${camelCaseModuleName.slice(1)}Actions`;
}

function buildModuleActionsNames(
  modules: ModuleSpecification[],
  camelCaseDocumentType: string,
) {
  return modules.map((m) => buildModuleActionsName(m, camelCaseDocumentType));
}

function buildModuleActionsImports(
  modules: ModuleSpecification[],
  camelCaseDocumentType: string,
) {
  const actionNames = buildModuleActionsNames(
    modules,
    camelCaseDocumentType,
  ).join(",\n");
  return `import { ${actionNames} } from "./gen/creators.js";`;
}

function buildModuleActionsSpreadExport(
  modules: ModuleSpecification[],
  camelCaseDocumentType: string,
) {
  const spreadActionNames = buildModuleActionsNames(
    modules,
    camelCaseDocumentType,
  )
    .map((n) => `...${n}`)
    .join(",\n");
  return `
export const actions = { ...baseActions, ${spreadActionNames} }`;
}
export const documentModelRootActionsFileTemplate = (
  v: DocumentModelTemplateInputs,
) =>
  ts`
import { baseActions } from "document-model";
${buildModuleActionsImports(v.modules, v.camelCaseDocumentType)}

/** Actions for the ${v.pascalCaseDocumentType} document model */
${buildModuleActionsSpreadExport(v.modules, v.camelCaseDocumentType)}
`.raw;
