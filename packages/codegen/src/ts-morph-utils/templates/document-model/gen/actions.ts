import { ts } from "@tmpl/core";
import { paramCase, pascalCase } from "change-case";
import type { ModuleSpecification } from "document-model";
import type { DocumentModelTemplateInputs } from "../../../name-builders/types.js";

function makeModuleActionsTypeImport(
  module: ModuleSpecification,
  pascalCaseDocumentType: string,
) {
  const pascalCaseModuleName = pascalCase(module.name);
  const paramCaseModuleName = paramCase(module.name);
  return `import type { ${pascalCaseDocumentType}${pascalCaseModuleName}Action } from "./${paramCaseModuleName}/actions.js";`;
}
function makeModuleActionsTypeImports(
  modules: ModuleSpecification[],
  pascalCaseDocumentType: string,
) {
  return modules
    .map((module) =>
      makeModuleActionsTypeImport(module, pascalCaseDocumentType),
    )
    .join("\n");
}

function makeModuleActionsTypeExport(module: ModuleSpecification) {
  const paramCaseModuleName = paramCase(module.name);
  return `export * from "./${paramCaseModuleName}/actions.js";`;
}

function makeModuleActionsTypeExports(modules: ModuleSpecification[]) {
  return modules.map(makeModuleActionsTypeExport).join("\n");
}

function makeModuleActionTypeName(
  module: ModuleSpecification,
  pascalCaseDocumentType: string,
) {
  const pascalCaseModuleName = pascalCase(module.name);
  return `${pascalCaseDocumentType}${pascalCaseModuleName}Action`;
}

function makeModuleActionTypesUnion(
  modules: ModuleSpecification[],
  pascalCaseDocumentType: string,
) {
  return modules
    .map((module) => makeModuleActionTypeName(module, pascalCaseDocumentType))
    .join("|\n");
}

function makeDocumentActionType(
  modules: ModuleSpecification[],
  pascalCaseDocumentType: string,
) {
  const actionTypeUnion = makeModuleActionTypesUnion(
    modules,
    pascalCaseDocumentType,
  );
  return `export type ${pascalCaseDocumentType}Action = ${actionTypeUnion};`;
}
export const documentModelGenActionsFileTemplate = (
  v: DocumentModelTemplateInputs,
) =>
  ts`
${makeModuleActionsTypeImports(v.modules, v.pascalCaseDocumentType)}

${makeModuleActionsTypeExports(v.modules)}

${makeDocumentActionType(v.modules, v.pascalCaseDocumentType)}
`.raw;
