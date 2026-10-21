import type {
  BaseSubgraph,
  GraphQLManager,
  SubgraphArgs,
} from "@powerhousedao/reactor-api";
import type * as ReactorApi from "@powerhousedao/reactor-api";
import type { DocumentNode } from "graphql";
import { expectTypeOf } from "vitest";

// @ts-expect-error -- ISubgraph is no longer part of the public API.
export type RemovedISubgraph = ReactorApi.ISubgraph;
// @ts-expect-error -- The legacy instance shape belongs to the host adapter.
export type InternalLegacySubgraph = ReactorApi.LegacySubgraph;
// @ts-expect-error -- Legacy constructor arguments belong to the host adapter.
export type InternalLegacySubgraphArgs = ReactorApi.LegacySubgraphArgs;

declare const manager: GraphQLManager;
declare const typeDefs: DocumentNode;
declare const args: SubgraphArgs;
declare const classSubgraph: BaseSubgraph;
declare const customSubgraph: BaseSubgraph & { readonly serviceName: "custom" };

const drive = {
  name: "drive",
  typeDefs,
  resolvers: {},
  reactorClient: args.reactorClient,
  relationalDb: args.relationalDb,
};

// @ts-expect-error -- Literal embedders must migrate to a BaseSubgraph subclass or cast.
manager.registerSubgraphInstance(drive, "graphql");
// @ts-expect-error -- setSupergraph accepts BaseSubgraph instances only.
manager.setSupergraph("extra", [drive, classSubgraph]);

export const registeredClass = manager.registerSubgraphInstance(classSubgraph);
expectTypeOf(registeredClass).toEqualTypeOf<
  Promise<BaseSubgraph | undefined>
>();
expectTypeOf(manager.registerSubgraphInstance(customSubgraph)).toEqualTypeOf<
  Promise<typeof customSubgraph | undefined>
>();
export const replaced = manager.setSupergraph("extra", [classSubgraph]);
expectTypeOf(replaced).toEqualTypeOf<Promise<void>>();

export const found = manager.getSubgraphByName("drive");
expectTypeOf(found).toEqualTypeOf<BaseSubgraph | undefined>();

expectTypeOf<Extract<keyof SubgraphArgs, "path">>().toEqualTypeOf<never>();
// @ts-expect-error -- The host's path is not a public constructor argument.
export const withPath: SubgraphArgs = { ...args, path: "/" };
