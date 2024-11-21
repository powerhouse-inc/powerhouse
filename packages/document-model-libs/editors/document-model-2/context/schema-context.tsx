import { createContext, useContext, useEffect, useState } from "react";
import {
  hiddenQueryTypeDefDoc,
  initialSchema,
  typeDefsDoc,
} from "../constants/documents";
import {
  buildASTSchema,
  buildSchema,
  DefinitionNode,
  DocumentNode,
  GraphQLSchema,
  Kind,
  parse,
  printSchema,
  validate,
} from "graphql";
import {
  createDefaultRules,
  isDocumentNode,
  isDocumentString,
} from "@graphql-tools/utils";
const hiddenQueryTypeDefinitions = parse(hiddenQueryTypeDefDoc).definitions;
const typeDefsDefinitions = parse(typeDefsDoc).definitions;
const alwaysIncludedDefinitions = [
  ...hiddenQueryTypeDefinitions,
  ...typeDefsDefinitions,
];
const rules = createDefaultRules().filter(
  (rule) => rule.name !== "ExecutableDefinitionsRule",
);

type TSchemaContext = string;

type TSchemaContextProps = {
  globalStateSchemaSdl: string;
  localStateSchemaSdl: string;
  operationSchemasSdl: string;
  children: React.ReactNode;
};

function makeSharedSchemaSdl(
  existingSchemaSdl: string,
  globalStateSchemaSdl?: string,
  localStateSchemaSdl?: string,
  operationSchemasSdl?: string,
) {
  try {
    const existingSchema = buildSchema(existingSchemaSdl);
    const sdls = [
      globalStateSchemaSdl,
      localStateSchemaSdl,
      operationSchemasSdl,
    ].filter(Boolean);
    const asts = sdls.map((sdl) => safeParseSdl(sdl)).filter(Boolean);
    const documentNode = makeSafeDocumentNode(existingSchema, asts);
    const schemaSdl = printSchema(buildASTSchema(documentNode));
    return schemaSdl;
  } catch (error) {
    console.debug("in make shared schema", error);
    return existingSchemaSdl;
  }
}

function makeSafeDocumentNode(schema: GraphQLSchema, asts: DocumentNode[]) {
  try {
    const definitions: DefinitionNode[] = [...alwaysIncludedDefinitions];
    for (const ast of asts) {
      for (const definition of ast.definitions) {
        const definitionDocumentNode: DocumentNode = {
          kind: Kind.DOCUMENT,
          definitions: [definition],
        };
        if (safeValidateAst(schema, definitionDocumentNode)) {
          definitions.push(definition);
        }
      }
    }
    const documentNode: DocumentNode = {
      kind: Kind.DOCUMENT,
      definitions,
    };
    return documentNode;
  } catch (error) {
    console.debug("in make safe document node", error);
    return {
      kind: Kind.DOCUMENT,
      definitions: alwaysIncludedDefinitions,
    } as DocumentNode;
  }
}

function safeValidateAst(schema: GraphQLSchema, ast: DocumentNode) {
  try {
    const errors = validate(schema, ast, rules);
    return !errors.length;
  } catch (error) {
    console.debug("in safe validate", error);
    return false;
  }
}

function safeParseSdl(sdl: string) {
  try {
    if (!sdl || !isDocumentString(sdl)) return null;
    return parse(sdl);
  } catch (error) {
    console.debug("in safe parse", error);
    return null;
  }
}

export const SchemaContext = createContext<TSchemaContext>(
  printSchema(initialSchema),
);
export function SchemaContextProvider(props: TSchemaContextProps) {
  const {
    children,
    globalStateSchemaSdl,
    localStateSchemaSdl,
    operationSchemasSdl,
  } = props;
  const [sharedSchemaSdl, setSharedSchemaSdl] = useState(() =>
    makeSharedSchemaSdl(
      printSchema(initialSchema),
      globalStateSchemaSdl,
      localStateSchemaSdl,
      operationSchemasSdl,
    ),
  );

  useEffect(() => {
    setSharedSchemaSdl((prev) =>
      makeSharedSchemaSdl(
        prev,
        globalStateSchemaSdl,
        localStateSchemaSdl,
        operationSchemasSdl,
      ),
    );
  }, [globalStateSchemaSdl, localStateSchemaSdl, operationSchemasSdl]);

  return (
    <SchemaContext.Provider value={sharedSchemaSdl}>
      {children}
    </SchemaContext.Provider>
  );
}

export function useSchemaContext() {
  return useContext(SchemaContext);
}
