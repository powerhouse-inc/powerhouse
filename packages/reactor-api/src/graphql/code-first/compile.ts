import type {
  DefinitionDiagnostic,
  SubgraphDefinition,
} from "@powerhousedao/shared/document-model";
import {
  compileSubgraph,
  createSubgraphEntryBuilders,
  projectSubgraphGraphQL,
  type SubgraphBinding,
} from "document-model";
import { type DocumentNode, type GraphQLResolveInfo, print } from "graphql";
import type { Context } from "../types.js";
import type { SubgraphSchemaEntry } from "./schema-builder.js";
import type { Subgraph } from "./subgraph.js";

export type SubgraphBindings = ReadonlyMap<
  string,
  SubgraphBinding<Subgraph, Context, GraphQLResolveInfo>
>;

export type CompiledSubgraph = {
  readonly kind: "compiled";
  readonly name: string;
  readonly definition: SubgraphDefinition;
  readonly diagnostics: readonly DefinitionDiagnostic[];
  readonly sdl: string;
  readonly bindings: SubgraphBindings;
  readonly hasSubscriptions: boolean;
};

/** `name` is absent for a code-first base, which declares no subgraphName. */
export type FailedSubgraph = {
  readonly kind: "failed";
  readonly name?: string;
  readonly diagnostics: readonly DefinitionDiagnostic[];
  readonly reason: string;
};

const compilations = new WeakMap<
  typeof Subgraph,
  CompiledSubgraph | FailedSubgraph
>();

const builders = createSubgraphEntryBuilders<
  Subgraph,
  Context,
  GraphQLResolveInfo
>();

export function compileSubgraphClass(
  cls: typeof Subgraph,
): CompiledSubgraph | FailedSubgraph {
  let compilation = compilations.get(cls);
  if (compilation === undefined) {
    compilation = compileOnce(cls);
    compilations.set(cls, compilation);
  }
  return compilation;
}

function compileOnce(cls: typeof Subgraph): CompiledSubgraph | FailedSubgraph {
  const name: unknown = cls.subgraphName;
  if (typeof name !== "string") {
    return {
      kind: "failed",
      diagnostics: [],
      reason: `${cls.name} has no static subgraphName`,
    };
  }
  let entries: readonly SubgraphSchemaEntry<never>[];
  try {
    entries = cls.getSchema(builders);
  } catch (error) {
    const diagnostics = [getSchemaThrew(name, cls.name, error)];
    return { kind: "failed", name, diagnostics, reason: reasonOf(diagnostics) };
  }
  const { definition, bindings, diagnostics } = compileSubgraph({
    name,
    // getSchema built these entries for `cls`, and bind.ts calls them with
    // instances of `cls` only.
    entries: entries as readonly SubgraphSchemaEntry<Subgraph>[],
  });
  if (definition === undefined) {
    return { kind: "failed", name, diagnostics, reason: reasonOf(diagnostics) };
  }
  return {
    kind: "compiled",
    name,
    definition,
    diagnostics,
    // The projection's node kinds are the same strings as graphql's `Kind`
    // values, which TypeScript types as an enum.
    sdl: print(projectSubgraphGraphQL(definition) as unknown as DocumentNode),
    bindings,
    hasSubscriptions: definition.hasSubscriptions,
  };
}

function getSchemaThrew(
  name: string,
  className: string,
  error: unknown,
): DefinitionDiagnostic {
  return {
    code: "PH-SG-ENTRY-INVALID",
    severity: "error",
    phase: "definition",
    definition: { kind: "subgraph", key: name },
    path: ["entries"],
    message: `${className}.getSchema threw: ${error instanceof Error ? error.message : String(error)}`,
    repair: "Make getSchema return the entries without throwing.",
  };
}

export function reasonOf(diagnostics: readonly DefinitionDiagnostic[]): string {
  return diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .map(
      ({ code, path, message }) =>
        `${code}${path.length > 0 ? ` at ${path.join(".")}` : ""}: ${message}`,
    )
    .join("; ");
}
