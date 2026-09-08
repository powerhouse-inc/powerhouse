import { camelCase, constantCase, kebabCase, pascalCase } from "change-case";

export type DocumentModelOperationNames = {
  readonly actionCreatorKey: string;
  readonly actionInputSchemaName: string | undefined;
  readonly actionInputTypeName: string | undefined;
  readonly actionType: string;
  readonly actionTypeName: string;
  readonly reducerMethod: string;
  readonly storedName: string;
};

export type DocumentModelModuleNames = {
  readonly actionTypeName: string;
  readonly directoryName: string;
  readonly moduleNamespace: string;
  readonly operationsInterfaceName: string;
  readonly operationsValueName: string;
  readonly storedName: string;
};

export type DocumentModelNames = {
  readonly graphQLName: string;
  readonly globalStateName: string;
  readonly localStateName: string;
  readonly valueName: string;
};

/** Names shared by authored definitions, runtime dispatch, and code generation. */
export function deriveDocumentModelOperationNames(
  operationKey: string,
  options: { readonly hasInput?: boolean } = {},
): DocumentModelOperationNames {
  const storedName = pascalCase(operationKey);
  const inputTypeName = options.hasInput ? `${storedName}Input` : undefined;
  return {
    actionCreatorKey: camelCase(constantCase(operationKey)),
    actionInputSchemaName: inputTypeName ? `${inputTypeName}Schema` : undefined,
    actionInputTypeName: inputTypeName,
    actionType: constantCase(operationKey),
    actionTypeName: `${storedName}Action`,
    reducerMethod: `${camelCase(operationKey)}Operation`,
    storedName,
  };
}

/** Names shared by authored modules and generated module scaffolds. */
export function deriveDocumentModelModuleNames(
  documentKey: string,
  moduleKey: string,
): DocumentModelModuleNames {
  const documentPascal = pascalCase(documentKey);
  const documentCamel = camelCase(documentKey);
  const modulePascal = pascalCase(moduleKey);
  const operationBase = `${documentCamel}${modulePascal}Operations`;
  return {
    actionTypeName: `${documentPascal}${modulePascal}Action`,
    directoryName: kebabCase(moduleKey),
    moduleNamespace: `${documentCamel}${modulePascal}Actions`,
    operationsInterfaceName: `${documentPascal}${modulePascal}Operations`,
    operationsValueName: operationBase,
    storedName: modulePascal,
  };
}

export function deriveDocumentModelNames(name: string): DocumentModelNames {
  const graphQLName = pascalCase(name);
  return {
    graphQLName,
    globalStateName: `${graphQLName}State`,
    localStateName: `${graphQLName}LocalState`,
    valueName: camelCase(name),
  };
}
