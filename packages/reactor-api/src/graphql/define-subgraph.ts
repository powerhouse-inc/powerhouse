import type {
  DefinitionDiagnostic,
  SubgraphDefinition,
} from "@powerhousedao/shared/document-model";
import { childLogger } from "document-model";
import {
  compileSubgraph,
  formatDefinitionDiagnostic,
  type SubgraphConfig,
} from "document-model/tooling";
import type {
  DocumentNode,
  GraphQLAbstractType,
  GraphQLResolveInfo,
  GraphQLScalarType,
} from "graphql";
import { BaseSubgraph } from "./base-subgraph.js";
import { packageScalarResolvers } from "./scalar-bindings.js";
import type { Context, SubgraphArgs, SubgraphClass } from "./types.js";

const logger = childLogger(["reactor-api", "define-subgraph"]);

export type DefineSubgraphConfig<TRequest extends Context = Context> =
  SubgraphConfig<
    BaseSubgraph,
    TRequest,
    GraphQLResolveInfo,
    GraphQLAbstractType,
    DocumentNode,
    Record<string, unknown>
  >;

export type DefinedSubgraph = SubgraphClass & {
  readonly definition: SubgraphDefinition;
  /** The declaration-time AST, available without constructing a host instance. */
  readonly typeDefs: DocumentNode;
  /** What compilation reported. Empty for a declaration that is well formed. */
  readonly diagnostics: readonly DefinitionDiagnostic[];
  /** Coercion for the package scalars the schema declares. */
  readonly scalarResolvers: Readonly<Record<string, GraphQLScalarType>>;
};

/**
 * Declares a subgraph in code and returns a subgraph class. Loaders and the
 * GraphQL manager handle classes. The manager constructs each one with
 * `SubgraphArgs` and awaits `onSetup`. The returned class passes the same
 * loader checks as a hand-written subgraph.
 *
 * The declaration compiles once, when `defineSubgraph` runs. Its diagnostics
 * are logged as warnings and exposed as the static `diagnostics`.
 */
export function defineSubgraph<TRequest extends Context = Context>(
  config: DefineSubgraphConfig<TRequest>,
): DefinedSubgraph {
  // Compiled once per declaration and frozen. Two instances of one class must
  // serve one schema, so the walk cannot run per construction.
  const compiled = compileSubgraph(config);
  const typeDefs = compiled.typeDefs as DocumentNode;
  const scalarResolvers = packageScalarResolvers(
    compiled.packageScalars.map((binding) => ({
      name: binding.definition.name,
      binding,
    })),
  );

  for (const diagnostic of compiled.diagnostics) {
    logger.warn(formatDefinitionDiagnostic(diagnostic));
  }

  return class CodeFirstSubgraph extends BaseSubgraph {
    static readonly definition = compiled.definition;
    static readonly typeDefs = typeDefs;
    static readonly diagnostics = compiled.diagnostics;
    static readonly scalarResolvers = scalarResolvers;

    declare hasSubscriptions?: boolean;

    constructor(args: SubgraphArgs) {
      super(args);
      this.name = config.name;
      this.typeDefs = typeDefs;
      // Resolver factories run once per construction, with the real instance.
      // Declaration, check, and inspect never call them, because a factory is
      // host code that may allocate, read a dependency, or count its calls.
      const resolvers = compiled.resolversFor(this);
      for (const diagnostic of compiled.checkResolvers(resolvers)) {
        logger.warn(formatDefinitionDiagnostic(diagnostic));
      }
      this.resolvers = { ...resolvers, ...scalarResolvers };
      if (compiled.hasSubscriptions !== undefined) {
        this.hasSubscriptions = compiled.hasSubscriptions;
      }
    }

    override async onSetup(): Promise<void> {
      await super.onSetup();
      await config.onSetup?.({ subgraph: this });
    }

    override async onDisconnect(): Promise<void> {
      await config.onDisconnect?.({ subgraph: this });
      await super.onDisconnect();
    }
  };
}
