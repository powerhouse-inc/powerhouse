# ADR 0006 — Class-based subgraphs with a static `getSchema`

- **Status:** Accepted
- **Date:** 2026-10-16
- **Deciders:** Yasiel Cabrera
- **Implements:** T-151 (plan T-151/P1, revision 7)

## Context

A subgraph author can write a subgraph in two styles today, and neither
supports a custom base class with per-instance state.

- **Schema-first.** A `BaseSubgraph` subclass sets the instance fields `name`,
  `typeDefs`, `resolvers`, `hasSubscriptions` and `path`. `BaseSubgraph`
  ships defaults for them (`name = "example"` and a `hello` schema), so a
  subclass that forgets a field still registers.
- **Code-first.** `defineSubgraph` (`packages/reactor-api/src/graphql/define-subgraph.ts`)
  takes a config object and always returns a `BaseSubgraph` subclass.
  Resolvers and hooks are typed against `BaseSubgraph`, and resolver factories
  run during construction, before `onSetup`.

The two styles split the codebase:

- Tooling branches by style. `definitionSources`, `ph model check`, the
  manifest, the barrel builder and the Vetra lint each carry a
  schema-first path and a code-first path.
- The route-segment name check exists only on the code-first path.

The host has two lifecycle gaps:

- When `onSetup` throws, `GraphQLManager` never calls `onDisconnect`. HTTP
  routes that the subgraph registered before the throw stay mounted.
- `GraphQLManager.shutdown()` disposes the WebSocket handlers, stops the Apollo
  servers and closes the WebSocket server. It does not call `onDisconnect`.

T-151 asked how a subgraph gets a custom base class, constructor behaviour and
instance state that its resolvers use. The investigation spiked four designs:

- **A.** A `base` option on `defineSubgraph`.
- **B.** A state factory.
- **C.** `use` resources with their own acquire and release.
- **D.** Class-first subgraphs, with the schema declared in a static.

T-151 records each spike with its tests and rerun steps. An agent-experience (AX) run gave four fresh agents one page of docs each and
the same five tasks, then scored them against hidden tests. Flexibility probes
F1 to F8 checked each design against eight extension cases. Two review rounds
across two models produced 32 findings on plan revision 3 and 17 edits on
revision 4. Revision 7 includes all of them.

Constraints from the user:

- Developer-facing breakage is accepted for old-style subgraphs.
- System APIs stay backward compatible: every endpoint path, schema, and
  WebSocket and SSE mount.
- Running hosts keep serving already-published old-style packages.

## Decision

Every GraphQL subgraph is a `BaseSubgraph` subclass that declares a static
`subgraphName` and a static `getSchema`. There is no schema-first or
code-first split for subgraphs. The document-model `--code-first` option is
unaffected.

```ts
export class InvoicesSubgraph extends BaseSubgraph<ShopContext> {
  static override readonly subgraphName = "invoices";
  static override getSchema(schema: SchemaBuilder<InvoicesSubgraph>) {
    return [
      schema.query("invoice", {
        args: { id: ph.OID({ required: true }) },
        returns: ph.ref(Invoice),
        resolve: ({ args, subgraph, request }) =>
          subgraph.load(args.id, request),
      }),
    ];
  }
}
```

The model follows Django class-based views. Class attributes hold
configuration, hooks are ordinary overrides extended through `super`, and each
class compiles once.

This removes `defineSubgraph` and its config shape, the instance fields
`name`, `typeDefs`, `resolvers`, `hasSubscriptions` and `path`,
`additionalContextFields`, the subgraph `--code-first` flag, and object-literal
subgraphs.

### 1. `getSchema` returns typed entries or one SDL schema

`static getSchema(schema)` returns a `SubgraphSchema`. That is either a list of
typed `ph` entries or exactly one `schema.graphql(...)` result:

```ts
export type SubgraphSchema = readonly TypedSubgraphEntry[] | SdlSchema;
```

- Typed entries come from `schema.query`, `schema.mutation`,
  `schema.subscription`, and the other `schema` builders. Arguments and return
  types use `ph` descriptors from `document-model`.
- `schema.graphql({ typeDefs, resolverCoordinates, resolvers })` wraps
  generated, third-party or not-yet-converted SDL. `resolvers` is a factory
  `(subgraph) => IResolvers<unknown, RequestOf<T>>`, so SDL resolvers get
  contextual types.
- The type forbids a mix of typed entries and SDL. Zero entries is an error.
- A child extends its parent with `[...super.getSchema(schema), ...]`.
  The compiler warns when a child drops its parent's root coordinates.
  Calling `schema.replaceParentSchema()` in the child's `getSchema` silences
  the warning.
- `getSchema` must be deterministic and free of side effects. Resolvers reach
  instance state through `subgraph`, never through `this`. Inside `getSchema`,
  `this` is the class being compiled, and state captured there is shared by
  every instance.
- The compiler derives `hasSubscriptions` from the schema's subscription root.
  Authors no longer declare it.

### 2. `subgraphName` is canonical kebab-case and never normalized

A class is concrete when its own static `subgraphName` is a string that
matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`. The name is the route segment and the
manifest id, so the two always match.

- **Type check.** `reactor-api` exports `SubgraphCheck<C>`. It rejects
  `"Invoices"`, `"foo--bar"` and `"foo-"` with
  `["subgraphName must be lowercase kebab-case", N]`. The same check rejects a
  `getSchema` whose builder names the wrong class, which method bivariance
  hides from ordinary override checks. Generated barrels emit the check per
  exported class, and a repo type test applies it to every core and
  switchboard class. Authors write nothing extra.
- **Runtime check.** `describe()` re-checks the name. This covers names
  widened to `string`, `--ignore-type-errors` and the vite dev loader, which
  all bypass the type check.
- **No normalization.** Rewriting a name would change a public URL, so an
  invalid name is an error.

A literal name prevents a subclass of a concrete subgraph from declaring a new
name (TS2417). Shared behaviour belongs in an abstract base. A concrete class
meant to be subclassed declares its name as `: string` and gives up the type
check for that name.

DocumentModel subgraphs keep their derived names. The host registers them
through `#setupDocumentModelSubgraphs`, which exempts them from the rule.

### 3. A versioned protocol under `Symbol.for("powerhouse.subgraph")`

Tooling and the host read a subgraph class through one protocol, never through
`instanceof`. `Symbol.for` makes it work across copies of `reactor-api`.

```ts
static [Symbol.for("powerhouse.subgraph")](): {
  version: 1;
  describe(options?: { checkDeterminism?: boolean }): { subgraphName, definition, typeDefs, hasSubscriptions, diagnostics, scalarDefinitions };
  bind(instance): { resolvers, scalarCoercions };
}
```

- `describe()` returns plain data only. Inspection calls it without
  constructing an instance or running a hook.
- `bind(instance)` returns resolvers and GraphQL-independent scalar coercion
  callbacks. The host builds each `GraphQLScalarType` with its own `graphql`
  copy.
- The version lives only in `version`. A host that sees an unknown version
  names both versions in its error.
- The wire format `SubgraphDefinition` and its `"graphql-ast-compat"`
  discriminator are unchanged.

### 4. Compile state is kept per class

Each class has one compile state: `compiling`, `ready` or `failed`.

- A re-entrant call while `compiling` is an error.
- The compiler memoizes a failure. A package change does not retry it or log
  it again.
- The compiler publishes the result before it logs diagnostics, and logs each
  diagnostic once.
- `getSchema` runs with the concrete class as its receiver.

Compilation runs at defined points only: when tooling loads the package, at
class registration before construction, and at instance registration
(`registerSubgraphInstance`) before `onSetup`.

When `NODE_ENV` is unset, empty, `development` or `test`, the compiler
evaluates `getSchema` twice with fresh builders and compares the printed SDL,
metadata and coordinates. A difference raises `getSchema is not
deterministic`. Tooling asks for the check with
`describe({ checkDeterminism: true })`, so `ph model check` and the release
check run it whatever `NODE_ENV` is. A class compiled without the check is
checked when a later caller asks for it. The check cannot see resolvers whose
captured state changes their results. Host-generated DocumentModel classes
skip it.

### 5. Binding is lazy, after `onSetup`, once per setup

The host calls `bind(instance)` after each `onSetup` resolves and before it
builds the schema. The host record, in a `WeakMap<instance, record>`, holds
the binding until the host removes the instance. Removal clears it after
`onDisconnect` and the unmount, so a later setup of the same instance binds
afresh.

Binding in the base constructor would run before subclass fields and
`#private` members exist. A review probe showed a public field reading
`undefined` and a `#private` read throwing `TypeError`. After `onSetup`, typed
entries close over a complete instance, and `schema.graphql` resolver
factories can read subclass fields and `#private` members.

Instance identity stays the key for admission, origins, claims and refusals.

### 6. Lifecycle guarantees

- **Failed setup.** If `onSetup` throws, the host calls `onDisconnect` on that
  candidate only, through `#runHook`. It logs teardown errors and rethrows the
  original setup error. `onDisconnect` must tolerate partial setup and release
  only what this instance acquired.
- **Shutdown is unchanged.** `GraphQLManager.shutdown()` keeps its current
  steps and does not call `onDisconnect`. `onDisconnect` means the subgraph is
  being unregistered while the process keeps running: a package update, a
  removal or a name eviction. It is not a process-exit hook.

### 7. Reuse through one abstract base and schema fragments

- **One shared abstract base.** It has no `subgraphName`. It holds
  helpers, state and lifecycle, and adds entries through `super.getSchema`.
- **Schema fragments.** A fragment is a plain function over the builder,
  constrained by a public capability interface. `viewSubject`,
  `servesDocument`, `servesDocumentOrThrows` and `listsDocument` become public
  so fragments can authorize.
- **Fragment lifecycle** is wired in the class's own hooks until T-258 adds
  resources.
- **No mixins.** TypeScript mixin factories fail declaration emit (TS4094) and
  lose the static types.
- A typed fragment cannot extend an SDL parent in this version, because a
  schema is typed entries or SDL, not both.

### 8. One subgraph owns each root field

A root field belongs to one subgraph. The host already drops the second
claimant from the supergraph. A fragment that adds root fields takes a field
name or namespace parameter, so two subgraphs can use it without a collision.

### 9. Old-style subgraphs

An old-style subgraph has an instance field `name`, `typeDefs`, `resolvers`,
`hasSubscriptions` or `path`, or has no static `subgraphName`.

- **Developer tooling errors.** `ph build`, `ph model check`, `ph generate`,
  `ph publish`/`prepack` and the Vetra dev flow fail on one. The error names
  the class, says what to change and points to `ph migrate`. `ph migrate`
  rewrites the released schema-first template to a class whose `getSchema`
  returns `schema.graphql(...)`. Five `never` tombstones on `BaseSubgraph`
  make the old fields compile errors (TS2416).
- **Running hosts stay compatible.** A switchboard host loading an
  already-published old-style package serves it through an isolated legacy
  adapter. The host classifies an instance once it is constructed. A class
  with its own static `subgraphName` goes through the protocol. Any other
  instance with `name`, `typeDefs`, `resolvers` or `hasSubscriptions`, tested
  with `in`, is old-style. Fields that `onSetup` assigns are read live, but
  they do not classify. When `NODE_ENV` is unset, empty, `development` or
  `test`, the host prints a deprecation notice once per class, with the
  `ph migrate` hint. Other values print nothing. The same applies to a class
  built against an older `reactor-api` that lacks the protocol.
- **Public host types.** `ISubgraph` and `SubgraphArgs.path` are removed.
  `registerSubgraphInstance` and `setSupergraph` accept `BaseSubgraph`
  instances. `getSubgraphByName` returns `BaseSubgraph | undefined`.
  Embedders wrap a literal in a `BaseSubgraph` subclass with `subgraphName`
  and `getSchema`, or cast it with `as unknown as BaseSubgraph`. The runtime
  adapter keeps serving the literal until its removal in a later major.
- **`this.path` at construction.** The host still passes `path` through
  internal legacy constructor arguments, including to older `reactor-api`
  copies. Today's `BaseSubgraph` copies it to `this.path` only for a class
  with no static `subgraphName` or `getSchema` of its own or from an ancestor
  below `BaseSubgraph`. Field initializers and constructors of a published
  old-style class read it as before. A class subgraph has no `path`.
  New code calls `graphqlManager.getBasePath()`.
- **Old fields beside a `subgraphName`.** The host refuses a protocol class
  with any of the five fields, tested with `in` after `new` and again after
  `onSetup`. Tooling never constructs a class, so it parses each class's
  source up to `BaseSubgraph`. It counts an instance field, a prototype
  method or accessor, and a write where `this` is the instance: in the
  constructor, an instance method or accessor, an instance field initializer,
  or an arrow function inside one of them. A write is `this.x =`,
  `this["x"] =`, a compound assignment, `Object.assign(this, …)` of an object
  literal, or `Object.defineProperty(this, "x", …)`. A method counts even if
  nothing calls it.
- **Nameless classes are an error.** A nameless class in the
  `subgraphs` entry is an error that names the class, unless it is an ancestor
  of an exported concrete class in the same entry. The host logs each accepted
  base once per package at info level.
- **Removal.** A later major removes the legacy adapter, once
  `tools/registry-audit` shows no published old-style subgraphs.

The change must ship as a major release. That is a release requirement, not
generator behavior: the generator writes the `@powerhousedao/reactor-api` peer
at the project's exact `document-model` pin and holds no range. The old major
is excluded only when the release workflow publishes a major version and
`ph migrate` rewrites a project's pin to that release. A host that loads the
package anyway, such as one reading the HTTP registry, resolves no peers. The
generated `subgraphs/index.ts` therefore throws on import when the first class
it exports lacks `Symbol.for("powerhouse.subgraph")`. An old host logs the
error and serves none of the package's subgraphs instead of serving them as
`example`.

### 10. Reserved names

| Kind             | Reserved                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Static members   | `subgraphName`, `getSchema`, `use` (T-258)                                                          |
| Instance members | `subgraphName` (a read-only mirror of the static), `onSetup`, `onDisconnect`, and future hook names |

Authors must not declare these for other purposes.

### 11. System APIs stay backward compatible

Every HTTP and GraphQL endpoint keeps its path, schema and behaviour. Every
WebSocket and SSE mount stays where it is.

Golden snapshots in `packages/reactor-api/test/__golden__/` prove it. They
record, for every core subgraph:

- `print(DocumentNode)` of the authored AST;
- the resolver coordinates;
- `hasSubscriptions`;
- the WebSocket and SSE mounts;
- the composed supergraph.

All 9 existing subgraphs first move to `schema.graphql` byte-identical. A
typed conversion compares `printSchema(lexicographicSortSchema())` plus
coordinates, and must pass authorization allow/deny parity tests. The
snapshots do not rely on `printSchema` alone, because it cannot see federation
directives.

## Consequences

### Positive

- One authoring model. Tooling has one reader, the protocol, instead of a
  branch per style.
- Resolvers are typed against the concrete class and its request type. They
  can use `protected` and `#private` members with no casts.
- Inspection reads a class without constructing it. A subgraph that imports
  `pg` can be checked with no host environment variables.
- A failed `onSetup` no longer leaks half-registered HTTP routes.
- An invalid or missing name is an error at check time or registration time.
  A class can no longer fall back to the `example` default.
- Classes from different `reactor-api` copies register on one host, with
  scalar coercion preserved.

### Negative / risks

- The change breaks subgraph authors. Every old-style package must run
  `ph migrate` before its next build.
- A concrete subgraph with a literal name cannot be subclassed under a new
  name (TS2417).
- Single inheritance gives no native way to compose behaviour from two
  packages. Flexibility probes F4 and F8 showed this for D. T-258 resources
  (`use`) are the planned fix.
- `--ignore-type-errors` and the vite dev loader bypass the type check. The
  runtime check still covers the name, but nothing else catches a wrong-class
  builder.
- The determinism check is best-effort and costs a second `getSchema` call
  per class in dev and test.
- A factory that returns an anonymous class fails declaration emit (26
  errors in the D flexibility probe). Factory classes such as Workflow and
  DocumentModel need an explicit public return type.
- The host keeps the legacy adapter until a later major.
- Third-party SDL that declares a subscription root but never set
  `hasSubscriptions` now gets WebSocket and SSE. The release notes say so.
  A schema that maps an operation to a type other than `Query`, `Mutation`
  or `Subscription` is served at its own `/stream` only. The host leaves it
  out of `/graphql/stream` and logs that once, because the merged schema
  would take its roots for every subgraph.

**Confidence:** high for the authoring model. D passed the AX run 11/11 with
no workarounds, and the type checker confirmed `SubgraphCheck`, static
`getSchema` with `super`, and fragment typing. Medium for cross-copy scalar
coercion until the cross-copy acceptance test passes.

**Revisit when:**

- T-258 adds resources as the static `use`;
- resolver middleware (`dispatch`) is designed;
- `tools/registry-audit` shows no published old-style subgraphs, which
  unblocks removing the adapter;
- a host needs protocol version 2.

## Alternatives considered

The AX run and the flexibility probes, as recorded on T-151:

|                                    | A `base` | B state | C `use` | D class-first |
| ---------------------------------- | -------- | ------- | ------- | ------------- |
| Hidden tests                       | 11/11    | 11/11   | 11/11   | 11/11         |
| Wall time                          | 115 s    | 107 s   | 102 s   | 94 s          |
| Tokens                             | 74k      | 67k     | 63k     | 63k           |
| Self-rating (max 25)               | 21       | 19      | 20      | 22            |
| Flexibility, native cells out of 8 | 4        | 3       | 5       | 4             |

D was fastest, scored highest and needed no structural workaround. This ADR
adopts D with `static getSchema` in place of the spike's static block.

### A. A `base` option on `defineSubgraph`

The returned class extends a given `BaseSubgraph` subclass. Rejected:

- The AX agent had to make private audit state public, and its migration moved
  `#private` resolver logic into public methods.
- It keeps two authoring styles and the tooling split.
- It needs guards for a base with its own definition, checks after `super()`
  and `super.onSetup()`, and a second generic for the request type. The
  curried spelling that fixes the generic breaks `findCodeFirstDefinitions`
  and the Vetra name regex.

### B. A state factory

`defineSubgraph` takes a factory that builds per-instance state. Rejected:

- Shared setup must be called by hand from each `onSetup`, and forgetting it
  fails silently.
- An explicit `<Ctx>` generic silently falls back to empty state.
- The AX agent needed a cast and turned legacy private fields into public
  state.
- Lowest flexibility score, 3 of 8.

### C. `use` resources alone

Each resource owns its acquire and release, with rollback on failed setup.
Rejected as the whole answer:

- The AX migration needed a module-level `WeakMap`, because reading a resource
  after dispose throws `PH-SG-RESOURCE-DISPOSED` instead of the legacy error.
- An explicit request generic was only a partial pass in the spike (9 pass,
  1 partial).

C is the only design that composes two packages natively. T-258 adds it on
top of this model as the reserved static `use`.

### D as spiked: `static { this.schema(...) }`

The spike declared the schema in a static block. Rejected in favour of
`static getSchema`:

- A static block schema is never inherited, so an abstract base cannot add
  entries.
- `name`, `typeDefs` and `resolvers` became own accessors, which needed three
  `@ts-expect-error` TS2611 suppressions.

An overridable static method extends through `super.getSchema(schema)` and
needs no accessors.

### Mixins

`Audited(RateLimited(BaseSubgraph))` composes behaviour by class factories.
Rejected:

- The F4 probe hit TS4094 declaration-emit failures.
- Nesting loses the static types.

### Do nothing

Keep schema-first classes and `defineSubgraph` side by side. Rejected:

- Custom base classes and instance state stay unsupported in code-first.
- Tooling keeps a branch per style.
- A subclass that forgets `name` keeps registering as `example`.
- The failed-setup route leak stays.
