import type { GraphQLResolverMap } from "@apollo/subgraph";
import type { IReactorClient, IRelationalDb } from "@powerhousedao/reactor";
import type { DocumentNode } from "graphql";
import type { HostedSubgraph } from "./hosted-subgraph.js";
import { isDevelopmentHost, SUBGRAPH_PROTOCOL } from "./subgraph-protocol.js";
import type { Context, SubgraphArgs } from "./types.js";

export type LegacySubgraph = {
  name: string;
  path?: string;
  resolvers: Record<string, any>;
  typeDefs: DocumentNode;
  reactorClient: IReactorClient;
  relationalDb: IRelationalDb;
  hasSubscriptions?: boolean;
  onSetup?: () => Promise<void>;
  onDisconnect?: () => Promise<void>;
};

export type LegacySubgraphArgs = SubgraphArgs & { readonly path?: string };

const LEGACY_FIELDS = [
  "name",
  "typeDefs",
  "resolvers",
  "hasSubscriptions",
  "path",
] as const;

type LegacyFields = {
  readonly name?: string;
  readonly typeDefs?: DocumentNode;
  readonly resolvers?: GraphQLResolverMap<Context>;
  readonly hasSubscriptions?: boolean;
};

export function legacyFieldsOf(instance: object): readonly string[] {
  return LEGACY_FIELDS.filter((field) => field in instance);
}

function declaresLegacySchema(instance: object): boolean {
  return legacyFieldsOf(instance).some((field) => field !== "path");
}

export function seedLegacyPath(
  instance: object,
  subgraphClass: object,
  path: string | undefined,
): void {
  if (isOldStyleClass(subgraphClass)) {
    Object.assign(instance, { path: path ?? "" });
  }
}

/**
 * Whether no class in the chain below the protocol's `BaseSubgraph` declares
 * a static `subgraphName` or `getSchema`. An object literal, or a class from
 * a copy that predates the protocol, is old-style.
 */
export function isOldStyleClass(subgraphClass: unknown): boolean {
  let current = subgraphClass;
  while (typeof current === "function") {
    if (Object.hasOwn(current, SUBGRAPH_PROTOCOL)) {
      return current !== subgraphClass;
    }
    if (
      Object.hasOwn(current, "subgraphName") ||
      Object.hasOwn(current, "getSchema")
    ) {
      return false;
    }
    current = Object.getPrototypeOf(current);
  }
  return true;
}

/** The record of an old-style instance that declares a schema and a name. */
export function legacySubgraph(instance: object): HostedSubgraph | undefined {
  const { name } = instance as LegacyFields;
  if (!declaresLegacySchema(instance) || typeof name !== "string") {
    return undefined;
  }
  warnDeprecated(instance);
  return legacyRecord(instance, name);
}

/** The record of an old-style instance after onSetup, which may rename it. */
export function renamedAfterSetup(hosted: HostedSubgraph): HostedSubgraph {
  const name = (hosted.instance as LegacyFields).name as string;
  return name === hosted.name ? hosted : legacyRecord(hosted.instance, name);
}

function legacyRecord(instance: object, name: string): HostedSubgraph {
  const fields = instance as LegacyFields;
  return {
    kind: "legacy",
    instance: instance as LegacySubgraph,
    name,
    get typeDefs() {
      return fields.typeDefs as DocumentNode;
    },
    get hasSubscriptions() {
      return Boolean(fields.hasSubscriptions);
    },
    bind: () => fields.resolvers as GraphQLResolverMap<Context>,
  };
}

const warnedClasses = new WeakSet<object>();
const warnedLiterals = new Set<string>();

function warnDeprecated(instance: object): void {
  if (!isDevelopmentHost()) return;
  const constructor = (instance as { constructor?: unknown }).constructor;
  const isClass = typeof constructor === "function" && constructor !== Object;
  const label = isClass
    ? constructor.name || "An anonymous subgraph class"
    : `The object-literal subgraph "${String((instance as LegacyFields).name)}"`;
  if (isClass) {
    if (warnedClasses.has(constructor)) return;
    warnedClasses.add(constructor);
  } else {
    if (warnedLiterals.has(label)) return;
    warnedLiterals.add(label);
  }
  console.warn(
    `${label} is an old-style subgraph: it declares name, typeDefs or resolvers instead of a static subgraphName and getSchema. This host serves it through a legacy adapter, which a later major release removes. Run \`ph migrate\` in its package to convert it.`,
  );
}
