import { ts } from "@tmpl/core";
import { camelCase, constantCase, paramCase, pascalCase } from "change-case";
import type {
  ModuleSpecification,
  OperationSpecification,
} from "document-model";
import type { DocumentModelTemplateInputs } from "../../../name-builders/types.js";

function makePascalCaseOperationName(operation: OperationSpecification) {
  if (!operation.name) {
    throw new Error("Operation is missing name");
  }
  return pascalCase(operation.name);
}

function makeCamelCaseOperationName(operation: OperationSpecification) {
  if (!operation.name) {
    throw new Error("Operation is missing name");
  }
  return camelCase(operation.name);
}

function makeConstantCaseOperationName(operation: OperationSpecification) {
  if (!operation.name) {
    throw new Error("Operation is missing name");
  }
  return constantCase(operation.name);
}

function makeOperationInputSchema(operation: OperationSpecification) {
  const pascalCaseOperationName = makePascalCaseOperationName(operation);
  return `${pascalCaseOperationName}InputSchema`;
}

function makeOperationInputSchemaImports(modules: ModuleSpecification[]) {
  const moduleOperationInputSchemas = modules
    .flatMap((module) => module.operations.map(makeOperationInputSchema))
    .join(",\n");
  return `import { ${moduleOperationInputSchemas} } from "./schema/zod.js";`;
}

function makeModuleOperationsImport(
  module: ModuleSpecification,
  camelCaseDocumentType: string,
) {
  const pascalCaseModuleName = pascalCase(module.name);
  const paramCaseModuleName = paramCase(module.name);
  return `import { ${camelCaseDocumentType}${pascalCaseModuleName}Operations } from "../src/reducers/${paramCaseModuleName}.js";`;
}

function makeModulesOperationsImports(
  modules: ModuleSpecification[],
  camelCaseDocumentType: string,
) {
  return modules
    .map((module) => makeModuleOperationsImport(module, camelCaseDocumentType))
    .join("\n");
}

function makeOperationInputSchemaInvocation(operation: OperationSpecification) {
  const operationInputSchema = makeOperationInputSchema(operation);
  const constantCaseOperationName = makeConstantCaseOperationName(operation);
  if (operation.schema === null) {
    return ts`
  if (Object.keys(action.input).length > 0) throw new Error("Expected empty input for action ${constantCaseOperationName}");
`.raw;
  }
  return ts`${operationInputSchema}().parse(action.input);`.raw;
}

function makeOperationsObjectName(
  module: ModuleSpecification,
  camelCaseDocumentType: string,
) {
  const pascalCaseModuleName = pascalCase(module.name);
  return `${camelCaseDocumentType}${pascalCaseModuleName}Operations`;
}

function makeOperationName(operation: OperationSpecification) {
  const camelCaseOperationName = makeCamelCaseOperationName(operation);
  return `${camelCaseOperationName}Operation`;
}

function makeOperationInvocation(
  module: ModuleSpecification,
  operation: OperationSpecification,
  camelCaseDocumentType: string,
) {
  const operationsObjectName = makeOperationsObjectName(
    module,
    camelCaseDocumentType,
  );
  const operationName = makeOperationName(operation);

  return ts`
  ${operationsObjectName}.${operationName}((state as any)[action.scope], action as any, dispatch);
  `.raw;
}

function makeModuleOperationCaseStatement(
  module: ModuleSpecification,
  camelCaseDocumentType: string,
) {
  return module.operations.map(
    (operation) =>
      ts`
      case "${makeConstantCaseOperationName(operation)}": {
        ${makeOperationInputSchemaInvocation(operation)}
        ${makeOperationInvocation(module, operation, camelCaseDocumentType)}
        break;
      }
      `.raw,
  );
}

function makeModuleOperationsCaseStatements(
  modules: ModuleSpecification[],
  camelCaseDocumentType: string,
) {
  return modules
    .map((module) =>
      makeModuleOperationCaseStatement(module, camelCaseDocumentType).join(
        "\n",
      ),
    )
    .join("\n");
}

export const documentModelGenReducerFileTemplate = (
  v: DocumentModelTemplateInputs,
) =>
  ts`
// TODO: remove eslint-disable rules once refactor is done
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model/core";
import type { ${v.phStateName} } from "${v.versionedDocumentModelPackageImportPath}";

${makeModulesOperationsImports(v.modules, v.camelCaseDocumentType)}

${makeOperationInputSchemaImports(v.modules)}

const stateReducer: StateReducer<${v.phStateName}> =
    (state, action, dispatch) => {
        if (isDocumentAction(action)) {
            return state;
        }
        switch (action.type) {
       ${makeModuleOperationsCaseStatements(v.modules, v.camelCaseDocumentType)}
            default:
                return state;
        }
    }

export const reducer = createReducer<${v.phStateName}>(stateReducer);
`.raw;
