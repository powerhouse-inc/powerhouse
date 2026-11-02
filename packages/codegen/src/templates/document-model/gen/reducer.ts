import type {
  ModuleSpecification,
  OperationSpecification,
} from "@powerhousedao/shared";
import { ts } from "@tmpl/core";
import { camelCase, constantCase, kebabCase, pascalCase } from "change-case";
import type { DocumentModelFileMakerArgs } from "file-builders";

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
  const kebabCaseModuleName = kebabCase(module.name);
  return `import { ${camelCaseDocumentType}${pascalCaseModuleName}Operations } from "../src/reducers/${kebabCaseModuleName}.js";`;
}

function makeModulesOperationsImports(
  modules: ModuleSpecification[],
  camelCaseDocumentType: string,
) {
  return modules
    .map((module) => makeModuleOperationsImport(module, camelCaseDocumentType))
    .join("\n");
}

function makeOperationInputSchemaInvocation(
  operation: OperationSpecification,
  parsesInput: boolean,
) {
  const operationInputSchema = makeOperationInputSchema(operation);
  const constantCaseOperationName = makeConstantCaseOperationName(operation);
  if (operation.schema === null) {
    return ts`
  if (Object.keys(action.input).length > 0) throw new Error("Expected empty input for action ${constantCaseOperationName}");
`.raw;
  }
  if (parsesInput) {
    return ts`const input = memoizedSchema(${operationInputSchema}).parse(action.input);`
      .raw;
  }
  return ts`memoizedSchema(${operationInputSchema}).parse(action.input);`.raw;
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
  parsesInput: boolean,
) {
  const operationsObjectName = makeOperationsObjectName(
    module,
    camelCaseDocumentType,
  );
  const operationName = makeOperationName(operation);
  const scope = operation.scope || "global";
  const actionTypeName = makeActionTypeName(operation);
  const operationAction = parsesInput ? "{ ...action, input }" : "action";

  return ts`
  ${operationsObjectName}.${operationName}(state.${scope}, ${operationAction} as ${actionTypeName}, dispatch);
  `.raw;
}

function makeActionTypeName(operation: OperationSpecification) {
  return `${makePascalCaseOperationName(operation)}Action`;
}

// The operation reducers take their own action types; `action` is any Action.
function makeActionTypeImports(modules: ModuleSpecification[]) {
  return modules
    .filter((module) => module.operations.length > 0)
    .map(
      (module) =>
        `import type { ${module.operations.map(makeActionTypeName).join(", ")} } from "./${kebabCase(module.name)}/actions.js";`,
    )
    .join("\n");
}

function makeModuleOperationCaseStatement(
  module: ModuleSpecification,
  camelCaseDocumentType: string,
  parsedInputOperations: ReadonlySet<string>,
) {
  return module.operations.map((operation) => {
    const parsesInput = parsedInputOperations.has(operation.name ?? "");
    return ts`
      case "${makeConstantCaseOperationName(operation)}": {
        ${makeOperationInputSchemaInvocation(operation, parsesInput)}
        ${makeOperationInvocation(module, operation, camelCaseDocumentType, parsesInput)}
        break;
      }
      `.raw;
  });
}

function makeModuleOperationsCaseStatements(
  modules: ModuleSpecification[],
  camelCaseDocumentType: string,
  parsedInputOperations: ReadonlySet<string>,
) {
  return modules
    .map((module) =>
      makeModuleOperationCaseStatement(
        module,
        camelCaseDocumentType,
        parsedInputOperations,
      ).join("\n"),
    )
    .join("\n");
}

function makeSchemaMemo(modules: ModuleSpecification[]) {
  const validates = modules.some((module) =>
    module.operations.some((operation) => operation.schema !== null),
  );
  if (!validates) {
    return "";
  }
  return ts`
const schemaMemo = new Map<() => unknown, unknown>();

function memoizedSchema<T>(makeSchema: () => T): T {
  let schema = schemaMemo.get(makeSchema) as T | undefined;
  if (schema === undefined) {
    schema = makeSchema();
    schemaMemo.set(makeSchema, schema);
  }
  return schema;
}
`.raw;
}

export const documentModelGenReducerFileTemplate = (
  v: DocumentModelFileMakerArgs,
  parsedInputOperations: ReadonlySet<string> = new Set(),
) =>
  ts`
import type { Reducer, StateReducer } from "document-model";
import { isDocumentAction, createReducer } from "document-model";
import type { ${v.phStateName} } from "${v.versionImportPath}";
${makeActionTypeImports(v.specification.modules)}

${makeModulesOperationsImports(v.specification.modules, v.camelCaseDocumentType)}

${makeOperationInputSchemaImports(v.specification.modules)}

${makeSchemaMemo(v.specification.modules)}

const stateReducer: StateReducer<${v.phStateName}> =
    (state, action, dispatch) => {
        if (isDocumentAction(action)) {
            return state;
        }
        switch (action.type) {
       ${makeModuleOperationsCaseStatements(v.specification.modules, v.camelCaseDocumentType, parsedInputOperations)}
            default:
                return state;
        }
    }

export const reducer: Reducer<${v.phStateName}> = createReducer(stateReducer);
`.raw;
