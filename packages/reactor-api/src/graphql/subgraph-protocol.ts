import type {
  DefinitionDiagnostic,
  LocationFreeGraphQLDocumentNode,
  ScalarDefinition,
  SubgraphDefinition,
} from "@powerhousedao/shared/document-model";
import { childLogger } from "document-model";
import {
  checkSubgraphDeterminism,
  checkSubgraphName,
  compileSubgraph,
  formatDefinitionDiagnostic,
  type CompiledSubgraph,
  type SubgraphClassShape,
} from "document-model/tooling";
import type { ValueNode } from "graphql";
import {
  packageScalarCoercion,
  resolverMapScalarCoercions,
} from "./scalar-bindings.js";

const logger = childLogger(["reactor-api", "subgraph"]);

/**
 * The key of a subgraph class's protocol method. `Symbol.for`, so a host
 * reads classes built against another copy of this package. The protocol's
 * version lives only in `version`.
 */
export const SUBGRAPH_PROTOCOL: unique symbol = Symbol.for(
  "powerhouse.subgraph",
);

export const SUBGRAPH_PROTOCOL_VERSION = 1;

/** What `describe()` returns: plain data, read without an instance. */
export type SubgraphDescription = {
  readonly subgraphName: string;
  readonly definition: SubgraphDefinition;
  /** The authored document, without source locations. */
  readonly typeDefs: LocationFreeGraphQLDocumentNode;
  readonly hasSubscriptions: boolean;
  readonly diagnostics: readonly DefinitionDiagnostic[];
  /** The package scalars a typed schema declares. */
  readonly scalarDefinitions: readonly ScalarDefinition[];
};

/**
 * A scalar's coercion, free of any copy of graphql. The host builds its own
 * `GraphQLScalarType` from it.
 */
export type SubgraphScalarCoercion = {
  readonly name: string;
  readonly description?: string | null;
  readonly specifiedByURL?: string | null;
  readonly extensions?: Readonly<Record<string, unknown>>;
  readonly serialize: (value: unknown) => unknown;
  readonly parseValue: (value: unknown) => unknown;
  readonly parseLiteral: (
    node: ValueNode,
    variables?: Readonly<Record<string, unknown>> | null,
  ) => unknown;
};

export type SubgraphDescribeOptions = {
  /**
   * Refuse a `getSchema` whose schema differs between two calls. Defaults to
   * the host's rule, {@link isDevelopmentHost}. Tooling passes `true`, so a
   * release check does not depend on `NODE_ENV`.
   */
  readonly checkDeterminism?: boolean;
};

/** What `bind(instance)` returns. */
export type SubgraphBinding = {
  /**
   * The resolver map as authored: generated from typed entries, or what
   * `schema.graphql`'s factory returned, scalar types included.
   */
  readonly resolvers: Readonly<Record<string, unknown>>;
  /** Package scalars, and the scalar types in an SDL resolver map. */
  readonly scalarCoercions: readonly SubgraphScalarCoercion[];
};

export type SubgraphProtocol = {
  readonly version: typeof SUBGRAPH_PROTOCOL_VERSION;
  /** Compiles the class on first use. Never constructs it or calls a hook. */
  describe(options?: SubgraphDescribeOptions): SubgraphDescription;
  /**
   * Binds the schema to one instance. The host calls it after each `onSetup`
   * resolves, so resolvers see subclass fields and `#private` members.
   */
  bind(instance: object): SubgraphBinding;
};

type ProtocolClass = SubgraphClassShape & { readonly prototype: object };

export const HOST_GENERATED: unique symbol = Symbol("host-generated");

type Compiled = {
  readonly compiled: CompiledSubgraph<object>;
  readonly description: SubgraphDescription;
  readonly packageCoercions: readonly SubgraphScalarCoercion[];
};

type Ready = Compiled & { readonly status: "ready" | "deterministic" };

type CompileState =
  | { readonly status: "compiling" }
  | Ready
  | { readonly status: "failed"; readonly error: unknown };

const states = new WeakMap<ProtocolClass, CompileState>();
const driftReported = new WeakSet<ProtocolClass>();

export function subgraphProtocolOf(
  subgraphClass: ProtocolClass,
): SubgraphProtocol {
  return {
    version: SUBGRAPH_PROTOCOL_VERSION,
    describe: (options) =>
      compiledClass(subgraphClass, options?.checkDeterminism).description,
    bind: (instance) => bindInstance(subgraphClass, instance),
  };
}

function compiledClass(
  subgraphClass: ProtocolClass,
  checkDeterminism = isDevelopmentHost(),
): Compiled {
  const hostGenerated = Object.hasOwn(subgraphClass, HOST_GENERATED);
  const check = checkDeterminism && !hostGenerated;
  const state = states.get(subgraphClass);
  switch (state?.status) {
    case "deterministic":
      return state;
    case "ready":
      return check ? checkedState(subgraphClass, state) : state;
    case "failed":
      throw state.error;
    case "compiling":
      throw new Error(
        `${subgraphClass.name}.getSchema re-entered its own compilation. getSchema must not read the subgraph protocol, describe() or bind().`,
      );
  }
  states.set(subgraphClass, { status: "compiling" });
  let ready: Ready;
  try {
    if (!hostGenerated) checkSubgraphName(subgraphClass);
    ready = {
      status: check ? "deterministic" : "ready",
      ...compiledState(
        compileSubgraph<object>(subgraphClass, { checkDeterminism: check }),
      ),
    };
  } catch (error) {
    states.set(subgraphClass, { status: "failed", error });
    throw error;
  }
  states.set(subgraphClass, ready);
  for (const diagnostic of ready.compiled.diagnostics) {
    logger.warn(formatDefinitionDiagnostic(diagnostic));
  }
  return ready;
}

function checkedState(subgraphClass: ProtocolClass, unchecked: Ready): Ready {
  states.set(subgraphClass, { status: "compiling" });
  try {
    checkSubgraphDeterminism(subgraphClass, unchecked.compiled);
  } catch (error) {
    states.set(subgraphClass, unchecked);
    throw error;
  }
  const checked: Ready = { ...unchecked, status: "deterministic" };
  states.set(subgraphClass, checked);
  return checked;
}

function compiledState(compiled: CompiledSubgraph<object>): Compiled {
  return {
    compiled,
    description: frozenCopy({
      subgraphName: compiled.name,
      definition: compiled.definition,
      typeDefs: compiled.typeDefs,
      hasSubscriptions: compiled.hasSubscriptions,
      diagnostics: compiled.diagnostics,
      scalarDefinitions: compiled.packageScalars.map(
        (binding) => binding.definition,
      ),
    }),
    packageCoercions: compiled.packageScalars.map((binding) =>
      packageScalarCoercion(binding, binding.definition.name),
    ),
  };
}

function frozenCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const member of Object.values(value)) deepFreeze(member);
  }
  return value;
}

function bindInstance(
  subgraphClass: ProtocolClass,
  instance: unknown,
): SubgraphBinding {
  if (
    typeof instance !== "object" ||
    instance === null ||
    !Object.prototype.isPrototypeOf.call(subgraphClass.prototype, instance)
  ) {
    throw new TypeError(`bind() takes an instance of ${subgraphClass.name}.`);
  }
  const { compiled, packageCoercions } = compiledClass(subgraphClass);
  const resolvers = compiled.resolversFor(instance);
  if (!driftReported.has(subgraphClass)) {
    driftReported.add(subgraphClass);
    for (const diagnostic of compiled.checkResolvers(resolvers)) {
      logger.warn(formatDefinitionDiagnostic(diagnostic));
    }
  }
  return Object.freeze({
    resolvers,
    scalarCoercions: [
      ...packageCoercions,
      ...resolverMapScalarCoercions(resolvers),
    ],
  });
}

export function isDevelopmentHost(): boolean {
  const environment = process.env.NODE_ENV;
  const nodeEnvUnset = environment === undefined || environment === "";
  if (nodeEnvUnset) return true;
  return environment === "development" || environment === "test";
}
