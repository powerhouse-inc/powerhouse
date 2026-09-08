# Code-first subgraphs

The author Interface and compatibility target are fixed. Delivery statements below describe the
pre-implementation baseline; current evidence is recorded in
[the delivery tracker](./10-delivery-tracker.md).

Code-first changes how an author declares a subgraph. It does not change the GraphQL schema, resolver
results, authorization order, transport exposure, package export shape, route identity, schema
augmentation, composition result, registration failure handling, or replacement behavior. Those
behaviors remain owned by the current GraphQL host. Changes to them need separate proposals and
compatibility evidence.

The compiler is a deep Module at the declaration Seam. It discovers reachable types, builds the
author-equivalent `DocumentNode`, assembles resolver maps, binds host dependencies, and returns the
class shape the current package loaders require. The existing host Adapter still augments and
registers that class.

## Match the current runtime contract

`defineSubgraph` returns a class, not an `ISubgraph` instance. Package loaders deal in
`SubgraphClass = typeof BaseSubgraph` (`packages/reactor-api/src/graphql/types.ts:17`), and
`GraphQLManager` constructs package classes with `SubgraphArgs`
(`packages/reactor-api/src/graphql/graphql-manager.ts:434-451`).

The generated constructor calls `super(args)`. That preserves the complete current Interface:

- `ISubgraph` requires `name`, `resolvers`, `typeDefs`, `reactorClient`, and `relationalDb`, and permits
  `path`, `hasSubscriptions`, and `onSetup`
  (`packages/reactor-api/src/graphql/types.ts:34-43`).
- `SubgraphArgs` supplies `reactorClient`, `relationalDb`, `analyticsStore`, `graphqlManager`,
  `syncManager`, document permission and authorization dependencies, the optional sync gate, and
  `path` (`packages/reactor-api/src/graphql/types.ts:45-60`).
- `BaseSubgraph` stores the inherited host dependencies and path
  (`packages/reactor-api/src/graphql/base-subgraph.ts:42-74`).
- registration awaits `onSetup` before inserting the instance
  (`packages/reactor-api/src/graphql/graphql-manager.ts:373-394`).

The public return contract is:

```ts
type DefinedSubgraph = SubgraphClass & {
  readonly definition: SubgraphDefinition;
};

declare function defineSubgraph<TRequest extends Context = Context>(
  config: SubgraphConfig<TRequest>,
): DefinedSubgraph;
```

The generated class passes its inherited `BaseSubgraph` instance to resolvers as `subgraph`, matching
the instance captured by current `getResolvers(this)` factories. Authors do not declare or copy host
dependencies. A typed request parameter may extend `Context` with fields installed through
`GraphQLManager.setAdditionalContextFields`. This preserves current read-model and analytics bindings.

`onSetup` remains part of the author Interface. Typed entries and the compatibility Adapter are
alternative schema declarations, so an author never maintains both:

```ts
type SubgraphConfigBase = {
  name: string;
  onSetup?(call: { subgraph: BaseSubgraph }): void | Promise<void>;
};

type SubgraphConfig<TRequest extends Context> = SubgraphConfigBase &
  (
    | {
        schemaKind: "typed";
        entries(
          builders: EntryBuilders<BaseSubgraph, TRequest>,
        ): readonly Entry[];
      }
    | {
        schemaKind: "graphql-ast-compat";
        compatibility: GraphQLAstCompatibility<TRequest>;
      }
  );
```

Dependencies outside `SubgraphArgs` may be captured by a host-created config and registered through
the existing `registerSubgraphInstance` Interface. Package-loaded classes remain constructible from
`SubgraphArgs` alone. The compiler does not replace either registration path.

## Preserve the package export shape

All current loaders expect a one-level namespace around the class, although their validation differs.
The generated package entry must keep the current naming convention: the outer namespace name equals
the inner class export name.

```ts
// subgraphs/index.ts
export * as ExampleSubgraph from "./example.js";
```

```ts
// subgraphs/example.ts
export const ExampleSubgraph = defineSubgraph({
  name: "example",
  schemaKind: "typed",
  // ...
});
```

This exact equality matters because the Vite loader indexes the inner namespace with the outer export
name (`packages/reactor-api/src/packages/vite-loader.mts:148-154`). Import and HTTP loaders flatten the
namespace instead (`packages/reactor-api/src/packages/import-loader.ts:71-77` and
`packages/reactor-api/src/packages/http-loader.ts:36-42`). The declaration migration does not tighten
their predicates or accept a new package shape. A strict shared predicate is follow-up loader work and
needs an inventory of currently accepted packages first.

## Typed resolver calls retain GraphQL execution data

Current resolvers receive parent, arguments, request context, and `GraphQLResolveInfo`. Subscription
subscribe and resolve functions receive the same execution data
(`packages/reactor-api/src/graphql/reactor/gen/graphql.ts:1388-1407`). The code-first Interface keeps
all four values and adds the bound subgraph instance without hiding the request:

```ts
type ResolverCall<TParent, TArgs, TRequest> = {
  parent: TParent;
  args: TArgs;
  subgraph: BaseSubgraph;
  request: TRequest;
  info: GraphQLResolveInfo;
};

type ResolveTypeCall<TValue, TRequest> = {
  value: TValue;
  subgraph: BaseSubgraph;
  request: TRequest;
  info: GraphQLResolveInfo;
  abstractType: GraphQLAbstractType;
};
```

An abstract resolver may return a descriptor, its exact GraphQL name, or `undefined`, synchronously or
as a promise. A union resolver is optional. GraphQL may instead use a returned `__typename` or an
object `isTypeOf` resolver. The compiler does not reject those current resolution strategies.

Typed builders must eventually cover interfaces, implemented interfaces, `isTypeOf`, enum runtime
value maps, directive declarations and uses, type extensions, schema definitions, scalar resolver
bindings, and every resolver form accepted by the current `DocumentNode` and resolver map Interface.
Until those forms have executable parity evidence, migrated schemas use the compatibility Adapter
below. The compiler must never approximate an unsupported AST kind.

## The current reactor-drive schema as code

The complete structured review vector is
[`fixtures/v1/subgraph-definition.json`](./fixtures/v1/subgraph-definition.json). It preserves the
current schema in `packages/reactor-drive/src/subgraph/schema.ts`:

- `ReactorDriveNodeKind`, `ReactorDrivePagingInput`, all four output objects, and
  `ReactorDriveNode`
- `reactorDrive`, `reactorDriveNode`, and `reactorDriveDescendants`
- `ReactorDrive.rootNodes` and `ReactorDriveFolderNode.children`
- the current `ID` fields and arguments
- no GraphQL default for paging and no subscription

The resolver's fallback limit of `100` remains resolver behavior, not SDL metadata
(`packages/reactor-drive/src/subgraph/resolvers.ts:19-27`). Every reactor-drive entry is currently
unguarded. A typed migration keeps that behavior in the resolver. The compiler adds no authorization
wrapper.

Switchboard currently constructs a `DriveNodeView`, adds only that `readModel` to request context, and
registers a prebuilt subgraph instance (`apps/switchboard/src/server.mts:568-575,795-812`). The current
`reactorDrive` resolver reads `reactorClient` from request context, even though the context factories do
not copy the instance's `reactorClient` field there
(`packages/reactor-api/src/graphql/graphql-manager.ts:570-575,584-599`). The query therefore throws
unless another integration supplies that field. Moving it to `subgraph.reactorClient` would change
observable behavior and belongs in a separate fix.

The behavior-preserving migration keeps the existing AST and resolver map through the compatibility
Adapter:

```ts
type ReactorDriveLegacyRequest = Context & ReactorDriveResolverContext;

export const ReactorDriveSubgraph = defineSubgraph<ReactorDriveLegacyRequest>({
  name: "reactor-drive",
  schemaKind: "graphql-ast-compat",

  compatibility: {
    kind: "graphql-ast-v1",
    typeDefs: reactorDriveSubgraphTypeDefs,
    getResolvers() {
      return createReactorDriveResolvers();
    },
    hasSubscriptions: undefined,
    preserveDefinitionOrder: true,
  },
});
```

Switchboard continues to register a prebuilt instance and install only `readModel`. The Adapter does
not repair or reinterpret the resolver's declared context. Activation compares the current failure and
success paths as observable resolver outcomes.

The typed review fixture proves that the descriptor grammar can represent this schema's field order,
argument order, nullability, enum order, union-member order, and GraphQL names. It is not the
reactor-drive activation candidate while the resolver-context mismatch remains. A later wiring fix can
adopt the typed resolver declaration after separate compatibility evidence passes.

## Resolvers own authorization ordering

The code-first declaration has no `access` property and the compiler adds no authorization wrapper.
This matches current custom subgraphs. A resolver that needs authorization calls the inherited
`BaseSubgraph` helpers through `subgraph`, such as `assertCanRead`, `assertCanWrite`, or
`assertCanExecuteOperation`.

The compiler cannot infer a permission check from an argument named `id`. It also cannot move a check
past validation, logging, metrics, or other resolver work without changing observable behavior. A
migration therefore keeps the original check in the resolver at the same position. Unguarded legacy
resolvers remain unguarded until an author makes a separate authorization change.

## Output and backing shapes

Computed fields create two types:

- `OutputOf<T>` is the GraphQL result shape.
- `SourceOf<T>` is the value a parent resolver supplies.

Computed fields are omitted from `SourceOf<T>`. Root and object-producing resolvers return
`MaybePromise<SourceOf<T>>`; computed-field resolvers return the field output type. GraphQL completion
turns the backing source into `OutputOf<T>`. Extra properties on output sources remain legal, matching
current GraphQL completion.

## A concrete compatibility Adapter

The typed grammar is not allowed to reduce GraphQL expressiveness. A migrated subgraph that uses an
AST or resolver form without a typed builder uses `GraphQLAstCompatibility`:

```ts
type GraphQLAstCompatibility<TRequest extends Context> = {
  kind: "graphql-ast-v1";
  typeDefs: DocumentNode;
  getResolvers(call: { subgraph: BaseSubgraph }): GraphQLResolverMap<TRequest>;
  hasSubscriptions: boolean | undefined;
  preserveDefinitionOrder: true;
};

type ResolverCoordinateDefinition = {
  typeName: string;
  fieldName: string | null;
  resolverKind:
    | "field"
    | "subscribe"
    | "resolve"
    | "resolveType"
    | "isTypeOf"
    | "enum"
    | "scalar";
};
```

This is code-authored compatibility data, not a return to generated source. The compiler removes `loc`
from the AST and serializes the remaining GraphQL AST nodes in their existing order. It records
resolver coordinates and the exact legacy `hasSubscriptions` value, while resolver closures stay
private on the class. It passes the original `DocumentNode` and resolver map to the current host
Adapter. It does not reinterpret interfaces, directives, extensions, custom scalars, federation
syntax, enum mappings, `isTypeOf`, `__typename`, subscription objects, or manual authorization.
Coordinates preserve resolver-map insertion order. For a type-level resolver, `fieldName` is `null`.

`hasSubscriptions` remains independent in compatibility mode because current transport setup depends
on that optional instance flag, not only on the presence of a `Subscription` type
(`packages/reactor-api/src/graphql/graphql-manager.ts:696-740`). New fully typed declarations may
derive the flag when no compatibility value exists. Migration must preserve the old value or reject an
inconsistent source instead of silently enabling WebSocket or SSE routes.

## Structured definition contract

The class carries versioned schema data, not host dependencies or resolver closures:

```ts
type SubgraphDefinitionBase = {
  kind: "powerhouse.subgraph";
  formatVersion: 1;
  name: string;
  compositionPolicy: "host-current";
  federationProfile: "host-current";
};

type SubgraphDefinition = SubgraphDefinitionBase &
  (
    | {
        schemaKind: "typed";
        hasSubscriptions: boolean;
        types: readonly NamedGraphQLTypeDefinition[];
        entries: readonly EntryDefinition[];
        scalars: readonly ScalarReferenceDefinition[];
      }
    | {
        schemaKind: "graphql-ast-compat";
        hasSubscriptions: boolean | null;
        document: LocationFreeDocumentNode;
        resolverCoordinates: readonly ResolverCoordinateDefinition[];
        access: "manual";
      }
  );

type ScalarReferenceDefinition = {
  name: string;
  implementation: `powerhouse.catalog#${string}`;
  graphQLProfile: "legacy-graphql-default-v1";
};
```

In the serialized compatibility variant, `hasSubscriptions: null` records the current runtime value
`undefined`; `false` and `true` retain their distinct transport behavior.

The typed form retains exact logical keys, GraphQL names, descriptions, deprecations, ordered
arguments, return references, and type and field tokens. The V1 wire format still records each field
resolver as `{ "kind": "manual" }`; the compiler supplies that compatibility marker rather than asking
the author to declare it. A missing GraphQL default is represented by an absent `defaultValue`
property. An explicit `= null` is represented by `defaultValue: null`; the two cases never share one
sentinel.

The definition digest covers only this structured data. It does not change when a catalog
implementation changes behind the same reference. A future host candidate identity that depends on a
catalog must combine the definition digest with a separate scalar-catalog digest and compiler version.

The typed review vector is
[`fixtures/v1/subgraph-definition.json`](./fixtures/v1/subgraph-definition.json). V1 must publish a
closed JSON Schema for both definition variants before implementation evidence can pass. No such JSON
Schema exists yet, so the vector is review data rather than conformance evidence.

The typed V1 form does not yet define custom directive declarations or arbitrary directive-use
builders. A migrated schema that contains them uses `graphql-ast-compat`, which preserves their exact
AST nodes and order. A later typed format may add concrete serialized directive shapes with its own
JSON Schema. The placeholder `DirectiveDefinition` name is not part of the V1 wire contract.

## Preserve current host schema augmentation

The generated class's `typeDefs` is the author-equivalent AST. It is not the final executable or
composed schema. The current host still calls `buildSubgraphSchemaModule`, which:

- adds the current document-model and platform definitions
- adds the current scalar declarations
- strips subgraph scalar declarations
- retains current keep-first named-definition deduplication
- adds the authored resolver map and current `JSONObject` resolver

These behaviors live in `packages/reactor-api/src/utils/create-schema.ts:86-99,126-299` and remain
behind the existing host Adapter. A direct descriptor-to-AST implementation must feed this Adapter at
the same Seam. It cannot bypass the augmentation because the author definition is not the complete
host schema.

Current authored AST order is also a compatibility property. Typed migration records an explicit
definition order when entry reachability would produce a different order. Compatibility mode retains
the location-free AST order directly. Activation requires matching `graphql.print`, executable schema
introspection, and resolver-coordinate behavior against the legacy class.

## Preserve current composition and registration

The compatibility oracle is the installed Apollo path, not a new house policy. The current host:

1. builds each subgraph schema in isolation and excludes a standalone-invalid subgraph
   (`packages/reactor-api/src/graphql/gateway/adapter-gateway-apollo.ts:33-59`);
2. composes the survivors with `LocalCompose`
   (`packages/reactor-api/src/graphql/gateway/adapter-gateway-apollo.ts:165-181`);
3. keeps the first duplicate subgraph name within a supergraph
   (`packages/reactor-api/src/graphql/graphql-manager.ts:373-403`);
4. logs and skips schema or handler setup failures
   (`packages/reactor-api/src/graphql/graphql-manager.ts:666-748`);
5. mounts an individual route before attempting a hot supergraph update, then logs a composition
   failure while leaving the existing supergraph active
   (`packages/reactor-api/src/graphql/graphql-manager.ts:529-542,681-695`).

Code-first definitions pass when the current legacy class and generated class produce the same
standalone result, Apollo composition result, mounted routes, and errors. A stricter collision policy
may run report-only, but it cannot reject activation in this RFC.

Package-change handling also remains additive. The current listener registers every reported class and
does not unregister classes omitted by a later package map
(`packages/reactor-api/src/server.ts:458-466`). A same-name registration keeps the existing instance,
and a cached route keeps its existing handler
(`packages/reactor-api/src/graphql/graphql-manager.ts:381-403,672-678`). Code-first does not turn that
path into replacement, reload resolver closures, or remove routes.

`SubgraphDefinition.name` remains the instance and route segment name. It is not a new global identity.
Current composition identity is route-qualified: the host derives it from the mounted subgraph path
(`packages/reactor-api/src/graphql/graphql-manager.ts:779-790`). The same bare name may occur in
different supergraph maps, and this proposal does not change that behavior.

## Preserve current document-model subgraph selection

Current generated document-model selection groups modules by
`module.documentModel.global.name`, compares the last stored specification version, treats a missing
version as `0`, and keeps the first module on a tie
(`packages/reactor-api/src/graphql/graphql-manager.ts:70-98`). `DocumentModelSubgraph` derives its route
name by kebab-casing that display name
(`packages/reactor-api/src/graphql/document-model-subgraph.ts:141-149`).

Code-first does not replace that selector. Grouping by document-model ID, validating positive safe
versions, or rejecting same-version ties may be desirable, but each changes current schema selection
and route behavior. Those changes belong to follow-up host work.

## Follow-up work that is not part of declaration parity

The following designs require their own compatibility and rollout proposals:

- `PH-COMP-1` enforcement or any policy stricter than the installed Apollo composer
- required and optional package-subgraph configuration
- package-owned prepare and serve revisions, compare-and-swap activation, removal, and cache eviction
- reloading same-name resolver closures and disposing replaced routes or subscription sources
- credential leases, expiry and revocation close behavior, per-event authorization, and the 30-second
  revocation target
- globally unique bare subgraph names or a new composition identity
- ID-based document-model family selection and stricter version validation
- a strict loader predicate that rejects values accepted by one of the current loaders
- typed author-facing Federation 2 facilities

These may fix real defects. They are not consequences of replacing SDL with TypeScript and therefore
cannot share its compatibility claim.

## Definition-time and release guarantees

The compiler reports stable diagnostics for invalid GraphQL names, unresolved references,
input/output position mistakes, missing typed computed-field bindings, catalog-reference failures, and
standalone schema failures. In compatibility mode it also reports unsupported typed migration forms
and preserves the current AST path. Diagnostics that describe behavior accepted by the current host
remain report-only until a separate proposal changes that behavior.

Release evidence compares, for every migrated subgraph:

- the author-equivalent printed `DocumentNode`, including definition, field, argument, enum, union,
  directive, and extension order;
- the host-augmented printed schema and introspection result;
- resolver coordinates and the full parent, args, request, info calling convention;
- results, errors, manual authorization ordering, and subscription transport exposure;
- package loading under Import, HTTP, and Vite using the current namespace convention;
- individual route identity and the installed Apollo composition result.

Compilation and composition happen at the current registration points, never per request. Resolver
calls add no authorization wrapper. The TypeScript, declaration, editor, runtime, and cache budgets in
[chapter 08](./08-implementation-plan.md) still apply.

The Module earns its Depth by hiding descriptor traversal, AST construction, resolver assembly,
subgraph binding, diagnostics, and loader-compatible class construction behind `defineSubgraph`. The
existing host Adapter retains ownership of augmentation, registration, routes, transports, and
composition. That Seam keeps the authoring change local and prevents it from becoming an unreviewed
host migration.
