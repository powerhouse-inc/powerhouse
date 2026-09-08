/**
 * Renders the code-first candidate for one legacy subgraph class.
 *
 * The candidate always uses `graphql-ast-compat`. Chapter 04 of the code-first
 * specification reserves the typed grammar for authored schemas: it may not be
 * used to re-describe a stored AST, because a typed rebuild would have to
 * reinterpret directives, extensions, federation syntax, enum mappings and
 * `isTypeOf` bindings that the typed V1 form cannot represent exactly. The
 * compatibility Adapter instead passes the original `DocumentNode` and resolver
 * map to the current host, so the printed schema, resolver coordinates and
 * transport exposure are the legacy ones by construction.
 */
import {
  isTypeScriptIdentifier,
  quoteJavaScriptValue as quoted,
} from "./source-rendering.js";

/** How the candidate reaches one legacy module-level binding. */
export type LegacySubgraphImport = {
  readonly importSpecifier: string;
  /** Only a `"named"` import puts this into the emitted source. */
  readonly exportName: string;
  readonly kind: "named" | "default" | "namespace";
};

/**
 * The legacy `typeDefs` expression. `document` covers a binding that already
 * holds a `DocumentNode`; `gql-source` covers `gql(schemaSource)` over an
 * imported SDL string, which must stay a call so the parse happens once at the
 * same point it does today.
 */
export type LegacySubgraphTypeDefsSource =
  | { readonly kind: "document"; readonly binding: LegacySubgraphImport }
  | {
      readonly kind: "gql-source";
      readonly binding: LegacySubgraphImport;
      readonly gql: LegacySubgraphImport;
    };

/**
 * The legacy `resolvers` expression. `factory` covers `getResolvers(this)`,
 * whose argument becomes the bound subgraph instance the host already passes.
 * `map` covers a resolver map held in a module-level binding.
 */
export type LegacySubgraphResolverSource =
  | { readonly kind: "factory"; readonly binding: LegacySubgraphImport }
  | { readonly kind: "map"; readonly binding: LegacySubgraphImport };

export type RenderCodeFirstSubgraphRequest = {
  /** The instance and route segment name. Never derived from the class name. */
  readonly name: string;
  /** The legacy class export name, preserved so package namespaces still match. */
  readonly exportName: string;
  readonly typeDefs: LegacySubgraphTypeDefsSource;
  readonly resolvers: LegacySubgraphResolverSource;
  /**
   * The exact legacy value. `undefined` records an undeclared field and is not
   * normalized to `false`, because the host reads the optional instance flag
   * rather than deriving it from a `Subscription` type.
   */
  readonly hasSubscriptions: boolean | undefined;
  /** Defaults to `@powerhousedao/reactor-api`. */
  readonly reactorApiPackage?: string;
};

const DEFAULT_REACTOR_API_PACKAGE = "@powerhousedao/reactor-api";

function assertBinding(binding: LegacySubgraphImport, path: string): void {
  if (binding.importSpecifier === "") {
    throw new Error(`PH-MIGRATE-SUBGRAPH-IMPORT-EMPTY: ${path}`);
  }
  // Only a named import puts the legacy export name into the emitted source.
  // Default and namespace forms bind the candidate's own local name instead.
  if (binding.kind === "named" && !isTypeScriptIdentifier(binding.exportName)) {
    throw new Error(`PH-MIGRATE-SUBGRAPH-BINDING-INVALID: ${path}`);
  }
}

function importStatement(binding: LegacySubgraphImport, local: string): string {
  const specifier = quoted(binding.importSpecifier);
  if (binding.kind === "default") {
    return `import ${local} from ${specifier};`;
  }
  if (binding.kind === "namespace") {
    return `import * as ${local} from ${specifier};`;
  }
  return binding.exportName === local
    ? `import { ${local} } from ${specifier};`
    : `import { ${binding.exportName} as ${local} } from ${specifier};`;
}

export function renderCodeFirstSubgraph(
  request: RenderCodeFirstSubgraphRequest,
): string {
  if (request.name === "") {
    throw new Error("PH-MIGRATE-SUBGRAPH-NAME-EMPTY");
  }
  if (!isTypeScriptIdentifier(request.exportName)) {
    throw new Error("PH-MIGRATE-SUBGRAPH-EXPORT-INVALID");
  }
  assertBinding(request.typeDefs.binding, "typeDefs");
  assertBinding(request.resolvers.binding, "resolvers");
  if (request.typeDefs.kind === "gql-source") {
    assertBinding(request.typeDefs.gql, "typeDefs.gql");
  }

  const reactorApiPackage =
    request.reactorApiPackage ?? DEFAULT_REACTOR_API_PACKAGE;
  const typeDefsLocal = `legacyTypeDefs`;
  const resolversLocal = `legacyResolvers`;
  const gqlLocal = `legacyGql`;

  const imports = [
    `import { defineSubgraph } from ${quoted(reactorApiPackage)};`,
  ];
  if (request.typeDefs.kind === "gql-source") {
    imports.push(importStatement(request.typeDefs.gql, gqlLocal));
  }
  imports.push(importStatement(request.typeDefs.binding, typeDefsLocal));
  imports.push(importStatement(request.resolvers.binding, resolversLocal));

  const typeDefsExpression =
    request.typeDefs.kind === "gql-source"
      ? `${gqlLocal}(${typeDefsLocal})`
      : typeDefsLocal;
  const resolversBody =
    request.resolvers.kind === "factory"
      ? `getResolvers({ subgraph }) {
      return ${resolversLocal}(subgraph);
    },`
      : `getResolvers() {
      return ${resolversLocal};
    },`;

  return `${imports.join("\n")}

/**
 * Verification candidate for the selected legacy subgraph.
 *
 * Generated by \`ph subgraph migrate\`. The legacy class stays the registered
 * subgraph until activation; this candidate is only reachable from the
 * verification subpath, so no loader sees two classes for one name.
 *
 * The legacy AST and resolver map are imported, not rewritten. Authorization
 * stays wherever the legacy resolvers already perform it.
 */
export const ${request.exportName} = defineSubgraph({
  name: ${quoted(request.name)},
  schemaKind: "graphql-ast-compat",

  compatibility: {
    kind: "graphql-ast-v1",
    typeDefs: ${typeDefsExpression},
    ${resolversBody}
    hasSubscriptions: ${String(request.hasSubscriptions)},
    preserveDefinitionOrder: true,
  },
});
`;
}
