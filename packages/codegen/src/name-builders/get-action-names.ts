import type {
  ModuleSpecification,
  OperationSpecification,
} from "@powerhousedao/shared";
import {
  deriveDocumentModelModuleNames,
  deriveDocumentModelOperationNames,
} from "document-model";
import { pascalCase } from "change-case";

export type OperationCodegenNames = {
  actionCreatorKey: string;
  actionInputSchemaName: string | undefined;
  actionInputTypeName: string | undefined;
  actionType: string;
  actionTypeName: string;
  reducerMethod: string;
  stateTypeName: string;
};

export type ModuleCodegenNames = {
  actionTypeName: string;
  directoryName: string;
  moduleNamespace: string;
  operationsInterfaceName: string;
  operationsValueName: string;
};

export type DocumentModelCodegenNames = {
  module(module: ModuleSpecification): ModuleCodegenNames;
  operation(operation: OperationSpecification): OperationCodegenNames;
};

type DocumentModelNameContext = {
  camelCaseDocumentType: string;
  pascalCaseDocumentType: string;
};

function requireOperationName(operation: OperationSpecification): string {
  if (!operation.name?.trim()) {
    throw new Error("Operation is missing name");
  }
  return operation.name;
}

function deriveOperationCodegenNames(
  operation: OperationSpecification,
  pascalCaseDocumentType = "",
): OperationCodegenNames {
  const operationName = requireOperationName(operation);
  const names = deriveDocumentModelOperationNames(operationName, {
    hasInput: operation.schema !== null,
  });
  return {
    ...names,
    stateTypeName: `${pascalCaseDocumentType}${pascalCase(operation.scope)}State`,
  };
}

/** Naming used by legacy generation and code-first compilation. */
export function deriveDocumentModelCodegenNames({
  camelCaseDocumentType,
  pascalCaseDocumentType,
}: DocumentModelNameContext): DocumentModelCodegenNames {
  return {
    module(module) {
      const names = deriveDocumentModelModuleNames(
        pascalCaseDocumentType,
        module.name,
      );
      return {
        ...names,
        moduleNamespace: `${camelCaseDocumentType}${pascalCase(module.name)}Actions`,
        operationsValueName: `${camelCaseDocumentType}${pascalCase(module.name)}Operations`,
      };
    },
    operation(operation) {
      return deriveOperationCodegenNames(operation, pascalCaseDocumentType);
    },
  };
}

export function getActionTypeName(operation: OperationSpecification) {
  return deriveOperationCodegenNames(operation).actionTypeName;
}

export function getActionInputName(operation: OperationSpecification) {
  return deriveOperationCodegenNames(operation).actionInputTypeName;
}

export function getActionType(operation: OperationSpecification) {
  return deriveOperationCodegenNames(operation).actionType;
}

export function getActionInputTypeNames(args: { module: ModuleSpecification }) {
  return args.module.operations
    .map(
      (operation) => deriveOperationCodegenNames(operation).actionInputTypeName,
    )
    .join(",\n");
}
