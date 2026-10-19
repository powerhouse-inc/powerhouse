import type { GraphQLResolverMap } from "@apollo/subgraph";
import { namelessSubgraphMessage } from "document-model/tooling";
import type { DocumentNode } from "graphql";
import type { BaseSubgraph } from "./base-subgraph.js";
import type { Context } from "./types.js";
import {
  declaresLegacySchema,
  isOldStyleClass,
  legacyFieldsOf,
  legacySubgraph,
  type LegacySubgraph,
  renamedAfterSetup,
} from "./legacy-subgraph.js";
import { scalarTypeFromCoercion } from "./scalar-bindings.js";
import {
  SUBGRAPH_PROTOCOL,
  SUBGRAPH_PROTOCOL_VERSION,
  type SubgraphDescription,
  type SubgraphProtocol,
} from "./subgraph-protocol.js";

export type HostedSubgraph = {
  readonly kind: "protocol" | "legacy";
  readonly instance: BaseSubgraph | LegacySubgraph;
  readonly name: string;
  readonly typeDefs: DocumentNode;
  readonly hasSubscriptions: boolean;
  bind(): GraphQLResolverMap<Context>;
};

export type DescribedSubgraphClass = {
  readonly protocol: SubgraphProtocol;
  readonly description: SubgraphDescription;
};

export function describeSubgraphClass(
  subgraphClass: unknown,
): DescribedSubgraphClass | undefined {
  if (
    typeof subgraphClass !== "function" ||
    !Object.hasOwn(subgraphClass, "subgraphName")
  ) {
    return undefined;
  }
  const name = classNameOf(subgraphClass);
  const read = (subgraphClass as { [SUBGRAPH_PROTOCOL]?: unknown })[
    SUBGRAPH_PROTOCOL
  ];
  if (typeof read !== "function") {
    throw new Error(
      `${name} declares a static subgraphName but has no subgraph protocol. Extend BaseSubgraph from @powerhousedao/reactor-api.`,
    );
  }
  const protocol = (read as () => Partial<SubgraphProtocol> | undefined).call(
    subgraphClass,
  );
  if (protocol?.version !== SUBGRAPH_PROTOCOL_VERSION) {
    throw new Error(
      `${name} speaks subgraph protocol version ${String(protocol?.version)}, and this host speaks version ${SUBGRAPH_PROTOCOL_VERSION}. Serve it with a @powerhousedao/reactor-api release that speaks version ${String(protocol?.version)}, or rebuild its package against this one.`,
    );
  }
  const described = protocol as SubgraphProtocol;
  return { protocol: described, description: described.describe() };
}

/**
 * The record the host admits an instance by, read after `new`. Undefined for
 * an old-style instance with no fields yet, which may set them in onSetup:
 * {@link hostSetUpSubgraph} decides for it after onSetup.
 */
export function hostSubgraph(
  instance: object,
  described: DescribedSubgraphClass | undefined = describeSubgraphClass(
    instance.constructor,
  ),
): HostedSubgraph | undefined {
  if (described !== undefined) return protocolSubgraph(instance, described);
  if (declaresLegacySchema(instance)) return legacySubgraph(instance);
  if (isOldStyleClass(instance.constructor)) return undefined;
  throw new Error(namelessSubgraphMessage(classNameOf(instance.constructor)));
}

/**
 * The record the host serves once onSetup has run, given the one
 * {@link hostSubgraph} returned. An old-style instance is read again, because
 * onSetup may set its fields or rename it.
 */
export function hostSetUpSubgraph(
  instance: object,
  hosted?: HostedSubgraph,
): HostedSubgraph {
  if (hosted?.kind === "protocol") return hosted;
  if (hosted !== undefined) return renamedAfterSetup(hosted);
  if (declaresLegacySchema(instance)) return legacySubgraph(instance);
  throw new Error(namelessSubgraphMessage(classNameOf(instance.constructor)));
}

/**
 * The resolvers a set-up record serves, read at every schema build. A
 * protocol record is bound once. An old-style instance may replace its
 * resolvers field at any time, and hosts have always served the current one.
 */
export function bindResolvers(
  hosted: HostedSubgraph,
): () => GraphQLResolverMap<Context> {
  if (hosted.kind === "legacy") return () => hosted.bind();
  const resolvers = hosted.bind();
  return () => resolvers;
}

function protocolSubgraph(
  instance: object,
  { protocol, description }: DescribedSubgraphClass,
): HostedSubgraph {
  const name = description.subgraphName;
  refuseLegacyFields(instance, name);
  return {
    kind: "protocol",
    instance: instance as BaseSubgraph,
    name,
    typeDefs: description.typeDefs as DocumentNode,
    hasSubscriptions: description.hasSubscriptions,
    bind() {
      refuseLegacyFields(instance, name);
      const binding = protocol.bind(instance);
      return {
        ...(binding.resolvers as GraphQLResolverMap<Context>),
        ...Object.fromEntries(
          binding.scalarCoercions.map((coercion) => [
            coercion.name,
            scalarTypeFromCoercion(coercion),
          ]),
        ),
      };
    },
  };
}

function refuseLegacyFields(instance: object, name: string): void {
  const fields = legacyFieldsOf(instance);
  if (fields.length === 0) return;
  throw new Error(
    `${classNameOf(instance.constructor)} declares static subgraphName "${name}" and the old-style ${fields.length === 1 ? "field" : "fields"} ${fields.join(", ")}, which the host ignores. Declare the schema in static getSchema and remove ${fields.length === 1 ? "it" : "them"}.`,
  );
}

export function classNameOf(subgraphClass: unknown): string {
  const name = (subgraphClass as { readonly name?: unknown } | undefined)?.name;
  return typeof name === "string" && name !== ""
    ? name
    : "An anonymous subgraph class";
}
