import { createDefaultRules, isDocumentString } from "@graphql-tools/utils";
import {
  buildASTSchema,
  buildSchema,
  type DefinitionNode,
  type DocumentNode,
  type GraphQLSchema,
  Kind,
  parse,
  printSchema,
  validate,
} from "graphql";
import { createContext, useContext, useEffect, useState } from "react";
import {
  hiddenQueryTypeDefDoc,
  initialSchema,
  typeDefsDoc,
} from "../constants/documents.js";

/* Required to make the schema "count" as an actual schema */
const hiddenQueryTypeDefinitions = parse(hiddenQueryTypeDefDoc).definitions;
/* Scalar definitions from the Powerhouse standard library */
const standardLibCustomScalarDefinitions = parse(typeDefsDoc).definitions;
/* These are always included when updating the shared schema, because they do not change */
const alwaysIncludedDefinitions = [
  ...hiddenQueryTypeDefinitions,
  ...standardLibCustomScalarDefinitions,
];
/* We use almost all of the standard graphql rules, but not the ExecutableDefinitionsRule because our schemas are not intended to be executed */
const rules = createDefaultRules().filter(
  (rule) => rule.name !== "ExecutableDefinitionsRule",
);

/* The shared schema is just a string to make memoization easier */
type TSchemaContext = string;

type TSchemaContextProps = {
  globalStateSchemaSdl: string;
  localStateSchemaSdl: string;
  operationSchemasSdl: string;
  children: React.ReactNode;
};

/* 
 Makes one SDL string from all of the definitions in the state and operation schemas
 Uses try catch to prevent errors from breaking the editor
*/
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
    const asts = sdls
      .map((sdl) => (sdl ? safeParseSdl(sdl) : null))
      .filter((ast) => ast !== null);
    const documentNode = makeSafeDocumentNode(existingSchema, asts);
    const schemaSdl = printSchema(buildASTSchema(documentNode));
    return schemaSdl;
  } catch (error) {
    console.debug("in make shared schema", error);
    return existingSchemaSdl;
  }
}

/* 
 Combines all of the definitions in the state and operation schemas into one document node
 Uses try catch to prevent errors from breaking the editor
*/
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

/* 
 Validates an ast against the schema
 Uses try catch to prevent errors from breaking the editor
*/
function safeValidateAst(schema: GraphQLSchema, ast: DocumentNode) {
  try {
    const errors = validate(schema, ast, rules);
    return !errors.length;
  } catch (error) {
    console.debug("in safe validate", error);
    return false;
  }
}

/* 
 Parses an SDL string into an ast
 Uses try catch abd checks if the SDL is a valid document string to prevent errors from breaking the editor
*/
function safeParseSdl(sdl: string) {
  try {
    if (!sdl || !isDocumentString(sdl)) return null;
    return parse(sdl);
  } catch (error) {
    return null;
  }
}

export const SchemaContext = createContext<TSchemaContext>(
  printSchema(initialSchema),
);

/* 
 Provides the shared schema to the editor
 We use the sdl string form to make memoization easier
*/
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
