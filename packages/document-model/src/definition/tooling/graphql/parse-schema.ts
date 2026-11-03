import type { LocationFreeGraphQLDocumentNode } from "@powerhousedao/shared/document-model";
import type * as GraphQL from "graphql";
import type { validateSDL } from "graphql/validation/validate.js";
import { createRequire } from "node:module";

/** graphql-js, plus the SDL validation its package index does not export. */
export type GraphQLModule = typeof GraphQL & {
  readonly validateSDL: typeof validateSDL;
};

let graphql: GraphQLModule | undefined;

/**
 * `graphql` is an optional peer: only tooling that reads SDL needs it, and a
 * package that imports document-model at runtime must not pay for it.
 */
export function loadGraphQL(): GraphQLModule {
  if (graphql !== undefined) return graphql;
  const require = createRequire(import.meta.url);
  let loaded: unknown;
  let validation: Partial<Pick<GraphQLModule, "validateSDL">>;
  try {
    loaded = require("graphql");
    validation = require("graphql/validation/validate.js") as typeof validation;
  } catch (error) {
    throw new Error(
      "Reading GraphQL SDL needs the optional peer dependency graphql@^16. Install it in the package that runs this tool.",
      { cause: error },
    );
  }
  if (
    loaded === null ||
    typeof loaded !== "object" ||
    typeof (loaded as Partial<GraphQLModule>).parse !== "function" ||
    typeof (loaded as Partial<GraphQLModule>).buildASTSchema !== "function" ||
    typeof validation.validateSDL !== "function"
  ) {
    throw new Error(
      "The installed graphql package does not export parse, buildASTSchema and validateSDL; install graphql@^16.",
    );
  }
  graphql = {
    ...(loaded as typeof GraphQL),
    validateSDL: validation.validateSDL,
  };
  return graphql;
}

function withoutLocations(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutLocations);
  if (node === null || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key, value]) => key !== "loc" && value !== undefined)
      .map(([key, value]) => [key, withoutLocations(value)]),
  );
}

export const EMPTY_DOCUMENT: LocationFreeGraphQLDocumentNode = {
  kind: "Document",
  definitions: [],
};

/** Parses one stored SDL segment. A missing `graphql` peer throws; bad SDL does not. */
export function parseSchema(
  sdl: string,
):
  | { readonly ok: true; readonly document: LocationFreeGraphQLDocumentNode }
  | { readonly ok: false; readonly message: string } {
  if (sdl.trim() === "") return { ok: true, document: EMPTY_DOCUMENT };
  const { parse } = loadGraphQL();
  try {
    return {
      ok: true,
      document: withoutLocations(
        parse(sdl, { noLocation: true }),
      ) as LocationFreeGraphQLDocumentNode,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
