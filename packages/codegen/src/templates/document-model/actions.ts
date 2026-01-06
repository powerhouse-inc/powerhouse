import type { DocumentModelTemplateInputs } from "@powerhousedao/codegen/ts-morph";
import { ts } from "@tmpl/core";
import { camelCase } from "change-case";
import type { ModuleSpecification } from "document-model";

function buildModuleActionsName(module: ModuleSpecification) {
  const camelCaseModuleName = camelCase(module.name);
  return `${camelCaseModuleName}Actions`;
}

function buildModuleActionsNames(modules: ModuleSpecification[]) {
  return modules.map(buildModuleActionsName);
}

function buildModuleActionsImports(modules: ModuleSpecification[]) {
  const actionNames = buildModuleActionsNames(modules).join(",\n");
  return `import { ${actionNames} } from "./gen/creators.js";`;
}

function buildModuleActionsSpreadExport(modules: ModuleSpecification[]) {
  const spreadActionNames = buildModuleActionsNames(modules)
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
${buildModuleActionsImports(v.modules)}

/** Actions for the ${v.pascalCaseDocumentType} document model */
${buildModuleActionsSpreadExport(v.modules)}
`.raw;
