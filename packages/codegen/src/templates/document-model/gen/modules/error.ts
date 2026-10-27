import type { DocumentModelModuleFileMakerArgs } from "@powerhousedao/codegen";
import type {
  ModuleSpecification,
  OperationErrorSpecification,
  OperationSpecification,
} from "@powerhousedao/shared";
import { ts } from "@tmpl/core";
import { pascalCase } from "change-case";

function getErrorName(error: OperationErrorSpecification) {
  if (!error.name) return;
  const pascalCaseErrorName = pascalCase(error.name);
  return pascalCaseErrorName;
}

function getErrorNames(errors: OperationErrorSpecification[]) {
  return errors.map(getErrorName).filter((name) => name !== undefined);
}
export type ModuleError = { name: string; code: string };

/** A module's error classes, one per name; the code falls back to the name. */
export function resolveModuleErrors(module: ModuleSpecification) {
  const byName = new Map<
    string,
    ModuleError & { description: string; operation: string }
  >();
  const warnings: string[] = [];
  for (const operation of module.operations) {
    for (const error of operation.errors) {
      const name = getErrorName(error);
      if (!name) continue;
      const code = error.code?.trim() || name;
      const description = error.description?.trim() ?? "";
      const operationName = operation.name ?? "";
      const first = byName.get(name);
      if (!first) {
        byName.set(name, { name, code, description, operation: operationName });
        continue;
      }
      if (first.code !== code) {
        throw new Error(
          `Module "${module.name}" defines the error ${name} with code "${first.code}" in ${first.operation} and code "${code}" in ${operationName}. Codegen generates one ${name} class per module, so give both the same code, or give one another name.`,
        );
      }
      if (first.description !== description) {
        warnings.push(
          `Module "${module.name}" defines the error ${name} in ${first.operation} and ${operationName} with different descriptions; both throw the one ${name} class.`,
        );
      }
    }
  }
  const errors: ModuleError[] = [...byName.values()].map(({ name, code }) => ({
    name,
    code,
  }));
  return { errors, warnings };
}

function getErrorCodeType(errors: ModuleError[]) {
  const codes = [...new Set(errors.map(({ code }) => JSON.stringify(code)))];
  return ts`export type ErrorCode = ${codes.join(" |\n")};`.raw;
}

function errorClassTemplate({ name, code }: ModuleError) {
  return ts`
    export class ${name} extends Error implements ReducerError {
      errorCode = ${JSON.stringify(code)} as ErrorCode;
      constructor(message = "${name}") {
        super(message);
      }
    }
  `.raw;
}

function getErrorsImplementations(args: DocumentModelModuleFileMakerArgs) {
  const { errors } = resolveModuleErrors(args.module);
  if (!errors.length) return "";

  return ts`
    ${getErrorCodeType(errors)}

    export interface ReducerError {
      errorCode: ErrorCode;
    }

    ${errors.map(errorClassTemplate).join("\n\n")}
  `.raw;
}

function getActionErrorsExport(operation: OperationSpecification) {
  if (!operation.name) return;
  const errors = operation.errors;
  if (errors.length === 0) return;
  const pascalCaseActionName = pascalCase(operation.name);
  const errorNames = getErrorNames(errors).filter(Boolean).join(",\n");
  return ts`
    ${pascalCaseActionName}: { ${errorNames} }
  `.raw;
}

function getErrorsExport(args: DocumentModelModuleFileMakerArgs) {
  const errorsForEachAction = args.module.operations
    .map(getActionErrorsExport)
    .filter(Boolean)
    .join(",\n");

  return ts`
  export const errors = { ${errorsForEachAction} };
  `.raw;
}

export const documentModelOperationsModuleErrorFileTemplate = (
  v: DocumentModelModuleFileMakerArgs,
) =>
  ts`
  ${getErrorsImplementations(v)}
  ${getErrorsExport(v)}
`.raw;
