import type { DefinitionNode, DocumentNode } from "graphql";
import { buildASTSchema, Kind, parse, printSchema } from "graphql";
import { createContext, useContext, useMemo } from "react";
import {
  hiddenQueryTypeDefDoc,
  initialSchemaStr,
  typeDefsDoc,
} from "../constants/documents.js";

/* Required to make the schema "count" as an actual schema */
const hiddenQueryTypeDefinitions =
  safeParseSdl(hiddenQueryTypeDefDoc)?.definitions ?? [];
/* Scalar definitions from the Powerhouse standard library */
const standardLibCustomScalarDefinitions =
  safeParseSdl(typeDefsDoc)?.definitions ?? [];
/* These are always included when building the shared schema, because they do not change */
const alwaysIncludedDefinitions: DefinitionNode[] = [
  ...hiddenQueryTypeDefinitions,
  ...standardLibCustomScalarDefinitions,
];

/* The shared schema is just a string to make memoization easier */
type TSchemaContext = {
  sharedSchema: string;
  error: Error | undefined;
};

type TSchemaContextProps = {
  globalStateSchemaSdl: string;
  localStateSchemaSdl: string;
  operationSchemasSdl: string;
  children: React.ReactNode;
};

/*
 Combines the always-included definitions and all user SDLs into a single
 DocumentNode and builds a schema in one shot. Building atomically lets
 buildASTSchema resolve forward references between user types within the same
 document, and avoids the accumulation/staleness that a per-definition
 validate-then-merge strategy would introduce. Throws if the combined SDL is
 invalid; callers are expected to catch.
*/
function makeSharedSchemaSdl(
  globalStateSchemaSdl?: string,
  localStateSchemaSdl?: string,
  operationSchemasSdl?: string,
): string {
  const definitions: DefinitionNode[] = [...alwaysIncludedDefinitions];

  for (const sdl of [
    globalStateSchemaSdl,
    localStateSchemaSdl,
    operationSchemasSdl,
  ]) {
    if (!sdl) continue;
    const ast = safeParseSdl(sdl);
    if (!ast) continue;
    definitions.push(...ast.definitions);
  }

  const documentNode: DocumentNode = {
    kind: Kind.DOCUMENT,
    definitions,
  };

  return printSchema(buildASTSchema(documentNode));
}

/*
 Parses an SDL string into an ast.
 Uses try catch and checks if the SDL is a valid document string to prevent errors from breaking the editor.
*/
export function safeParseSdl(sdl: string) {
  try {
    if (!sdl) return null;
    return parse(sdl);
  } catch (error) {
    return null;
  }
}

export const SchemaContext = createContext<TSchemaContext>({
  sharedSchema: initialSchemaStr,
  error: undefined,
});

export function parseSharedSchemaSdl(
  globalStateSchemaSdl?: string,
  localStateSchemaSdl?: string,
  operationSchemasSdl?: string,
): TSchemaContext {
  try {
    return {
      sharedSchema: makeSharedSchemaSdl(
        globalStateSchemaSdl,
        localStateSchemaSdl,
        operationSchemasSdl,
      ),
      error: undefined,
    };
  } catch (error) {
    // Combined SDL is invalid (duplicate type, unknown reference, parse error, etc.).
    // Fall back to the minimal base schema so the JSON initial-value validator
    // gracefully finds no state type and skips, instead of producing a misleading
    // "Field value has an invalid value." The real reason is surfaced via `error`.
    return {
      sharedSchema: initialSchemaStr,
      error:
        error instanceof Error
          ? error
          : new Error(
              typeof error === "string" ? error : JSON.stringify(error),
              { cause: error },
            ),
    };
  }
}

/*
 Provides the shared schema to the editor.
 We use the sdl string form to make memoization easier.
*/
export function SchemaContextProvider(props: TSchemaContextProps) {
  const {
    children,
    globalStateSchemaSdl,
    localStateSchemaSdl,
    operationSchemasSdl,
  } = props;

  const sharedSchemaSdl = useMemo(
    () =>
      parseSharedSchemaSdl(
        globalStateSchemaSdl,
        localStateSchemaSdl,
        operationSchemasSdl,
      ),
    [globalStateSchemaSdl, localStateSchemaSdl, operationSchemasSdl],
  );

  return (
    <SchemaContext.Provider value={sharedSchemaSdl}>
      {children}
    </SchemaContext.Provider>
  );
}

export function useSchemaContext() {
  return useContext(SchemaContext);
}
