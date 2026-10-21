# Subgraph classes

A custom subgraph extends `BaseSubgraph<Ctx>`, where `Ctx extends Context`. A concrete class declares its own `static override readonly subgraphName = "kebab-case"` and supplies a nonempty schema through `static override getSchema(schema: SchemaBuilder<ThatClass>)`.

## Schema forms

`getSchema` returns a readonly array of typed entries or one `schema.graphql(...)` value. Typed entries use `ph` descriptors from `document-model` and the query, mutation, subscription, and computed-field builders on `schema`.

SDL belongs inside `schema.graphql`. Its resolver factory receives the instance after setup, so it can access initialized fields and private members:

```typescript
import {
  BaseSubgraph,
  type Context,
  type SchemaBuilder,
} from "@powerhousedao/reactor-api";
import { ph } from "document-model";
import { gql } from "graphql-tag";

export class ReportsSubgraph extends BaseSubgraph<Context> {
  static override readonly subgraphName = "reports";
  #label = "Quarterly report";

  static override getSchema(schema: SchemaBuilder<ReportsSubgraph>) {
    return schema.graphql({
      typeDefs: gql`
        type Query {
          reportLabel: String!
        }
      `,
      resolverCoordinates: [
        { typeName: "Query", fieldName: "reportLabel", resolverKind: "field" },
      ],
      resolvers: (subgraph) => ({
        Query: { reportLabel: () => subgraph.#label },
      }),
    });
  }
}
```

`resolverCoordinates` lists the authored resolver coordinates. When the host binds the first instance, it compares this list with the map that `resolvers` returns and logs a warning for each mismatch. It does not refuse the subgraph. `resolverKind` is `field`, `subscribe`, `resolve`, `resolveType`, `isTypeOf`, `enum`, or `scalar`. `fieldName` is `null` for a type-level resolver. `hasSubscriptions` comes from the schema's operation roots, including explicit subscription-root mappings. Authors do not set a flag.

A schema cannot combine typed entries with an SDL wrapper. A typed fragment cannot extend an SDL parent. `getSchema` is deterministic and has no side effects. The compiler evaluates it twice to detect changes in the schema or coordinates. It does so whenever `ph` tooling reads a subgraph, such as in `ph build`, and on a host whose `NODE_ENV` is unset, empty, `development`, or `test`. This check cannot detect changing state captured by a resolver.

Resolvers use `subgraph` for instance state. Static `this` refers to the concrete class during compilation. State captured through static `this` is shared by every instance and can cross request boundaries.

This class captures shared state. Static `this` names the class, and the module-level map also belongs to every instance:

```typescript
import { BaseSubgraph, type SchemaBuilder } from "@powerhousedao/reactor-api";
import { ph } from "document-model";

const sharedCounts = new Map<string, number>();

export class CountsSubgraph extends BaseSubgraph {
  static override readonly subgraphName = "counts";
  static readonly counts = sharedCounts;

  static override getSchema(schema: SchemaBuilder<CountsSubgraph>) {
    const counts = this.counts;
    return [
      schema.query("count", {
        returns: ph.Int({ required: true }),
        resolve: () => counts.get("total") ?? 0,
      }),
    ];
  }
}
```

Read per-instance state through the resolver's `subgraph` parameter instead:

```typescript
import { BaseSubgraph, type SchemaBuilder } from "@powerhousedao/reactor-api";
import { ph } from "document-model";

export class CountsSubgraph extends BaseSubgraph {
  static override readonly subgraphName = "counts";
  #counts = new Map<string, number>();

  static override getSchema(schema: SchemaBuilder<CountsSubgraph>) {
    return [
      schema.query("count", {
        returns: ph.Int({ required: true }),
        resolve: ({ subgraph }) => subgraph.#counts.get("total") ?? 0,
      }),
    ];
  }
}
```

### JSON objects

A typed entry can use the host's `JSONObject` scalar through `subgraphScalars.JSONObject()` from `document-model`. The value is a JSON object with string keys, and its TypeScript type is `Record<string, unknown>`. The host declares the scalar and coerces variables, literals, and results with `GraphQLJSONObject`.

```typescript
import { BaseSubgraph, type SchemaBuilder } from "@powerhousedao/reactor-api";
import { subgraphScalars } from "document-model";

export class SettingsSubgraph extends BaseSubgraph {
  static override readonly subgraphName = "settings";
  #settings: Record<string, unknown> = { theme: "dark" };

  static override getSchema(schema: SchemaBuilder<SettingsSubgraph>) {
    return [
      schema.query("settings", {
        returns: subgraphScalars.JSONObject({ required: true }),
        resolve: ({ subgraph }) => subgraph.#settings,
      }),
    ];
  }
}
```

`ph` has no `JSONObject` member, because a document model cannot use the scalar. A document model field built with `subgraphScalars.JSONObject()` fails with `PH-SCALAR-INTERNAL`. `subgraphScalars` is available from this release. A package that uses it needs `document-model` and `@powerhousedao/reactor-api` from this release or later.

## Inheritance and fragments

Shared state, helpers, and lifecycle belong in one abstract base without a `subgraphName`. A schema fragment is a function constrained by public capabilities. TypeScript mixin factories are unsupported because they lose static types and can fail declaration emit.

```typescript
import {
  BaseSubgraph,
  type Context,
  type SchemaBuilder,
} from "@powerhousedao/reactor-api";
import { ph } from "document-model";

interface HasLabel {
  label(): string;
}

function labelFragment<T extends BaseSubgraph<Context> & HasLabel>(
  schema: SchemaBuilder<T>,
  fieldName: string,
) {
  return schema.query(fieldName, {
    returns: ph.String({ required: true }),
    resolve: ({ subgraph }) => subgraph.label(),
  });
}

interface CanListDocuments {
  listsDocument(identifier: string, request: Context): Promise<boolean>;
}

function visibilityFragment<T extends BaseSubgraph<Context> & CanListDocuments>(
  schema: SchemaBuilder<T>,
  fieldName: string,
) {
  return schema.query(fieldName, {
    args: { id: ph.String({ required: true }) },
    returns: ph.Boolean({ required: true }),
    resolve: ({ args, subgraph, request }) =>
      subgraph.listsDocument(args.id, request),
  });
}

abstract class LabeledSubgraph extends BaseSubgraph<Context> {
  label(): string {
    return "Reports";
  }

  static override getSchema(schema: SchemaBuilder<LabeledSubgraph>) {
    return [labelFragment(schema, "reportsLabel")];
  }
}

export class ReportsSummarySubgraph extends LabeledSubgraph {
  static override readonly subgraphName = "reports-summary";

  static override getSchema(schema: SchemaBuilder<ReportsSummarySubgraph>) {
    return [
      ...super.getSchema(schema),
      visibilityFragment(schema, "reportsDocumentVisible"),
      schema.query("reportsCount", {
        returns: ph.Int({ required: true }),
        resolve: ({ subgraph }) => subgraph.count(),
      }),
    ];
  }

  count(): number {
    return 3;
  }
}
```

`super.getSchema(schema)` preserves parent entries. Omitting it replaces them. If replacement is intentional, call `schema.replaceParentSchema()` in the child's `getSchema` to suppress the `PH-SG-PARENT-FIELDS-DROPPED` warning.

A fragment that adds a root field takes a field name or namespace, because each root field has one owner across the supergraph. A fragment accesses public members only. The authorization helpers `viewSubject`, `servesDocument`, `servesDocumentOrThrows`, and `listsDocument` are public and usable from fragments.

A concrete class with a literal name cannot be subclassed with another name (TS2417). Share through an abstract base. If a concrete class is deliberately extensible, its name declaration can use `: string`. That name then gets runtime validation instead of literal type validation.

### Generic bases use a shared constraint

A static method cannot reference the class's type parameter. For example, `static getSchema(schema: SchemaBuilder<GenericSubgraph<TRequest>>)` produces TS2302. This also applies to a generic concrete class. Type its schema against a shared request constraint instead:

```typescript
import {
  BaseSubgraph,
  type Context,
  type SchemaBuilder,
} from "@powerhousedao/reactor-api";
import { ph } from "document-model";

interface ShopContext extends Context {
  shopId: string;
}

abstract class ShopSubgraph<
  TRequest extends ShopContext,
> extends BaseSubgraph<TRequest> {
  static override getSchema(schema: SchemaBuilder<ShopSubgraph<ShopContext>>) {
    return [
      schema.query("shopId", {
        returns: ph.String({ required: true }),
        resolve: ({ request }) => request.shopId,
      }),
    ];
  }
}
```

The static schema can use `ShopContext`. It cannot depend on fields that only a particular `TRequest` adds.

## Lifecycle

`onSetup()` and `onDisconnect()` are ordinary overrides that call `super`. The host compiles before construction and binds resolvers after setup. Inspection constructs no instance and calls no hook.

If setup fails, the host calls teardown on that candidate, logs teardown failures, and rethrows the setup error. Teardown tolerates partial setup and releases only resources acquired by that instance. It also handles package replacement, removal, and name eviction. `GraphQLManager.shutdown()` does not call `onDisconnect()`. This hook is not a process-exit hook.

## Names and checks

Names match `^[a-z0-9]+(?:-[a-z0-9]+)*$`. The host does not normalize them because normalization would change URLs. The generated barrel applies `SubgraphCheck<typeof YourClass>` to check the name and builder target. If the check reports `["getSchema names the wrong class", X]`, change the type argument of `SchemaBuilder<X>` to the class being described, or to an inherited compatible base.

`ph` tooling refuses a nameless exported class unless it is an ancestor of an exported concrete subgraph in the same entry. Shared bases can also live outside `subgraphs/`. A misspelled `getSchema` inherits the empty base schema and fails with `PH-SG-DEFINITION-INVALID` (`getSchema returned no entries`). `noImplicitOverride` helps check overrides, but cannot catch a newly declared misspelled method without `override`.

`--ignore-type-errors` and the development loader bypass type checks. Runtime name validation still runs. Developer tooling refuses old-style fields and directs authors to `ph migrate`. Running hosts serve published old-style packages through the legacy adapter, with one notice per class only in development.

### Fix authoring errors

`ph build` checks TypeScript before definition validation. These errors can appear before the `PH-SG-DEFINITION-INVALID` diagnostic that suggests `ph migrate`.

| Error                                                                                  | Fix                                                                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| TS2416 (with TS4114) on `name`, `typeDefs`, `resolvers`, `hasSubscriptions`, or `path` | Old-style subgraph. Run `ph migrate`, review the conversion, and rebuild. |
| TS2540 when assigning `name`, `typeDefs`, `resolvers`, `hasSubscriptions`, or `path`   | Old-style subgraph. Run `ph migrate`, review the conversion, and rebuild. |

## Protocol

`YourClass[SUBGRAPH_PROTOCOL]()` returns protocol version 1, where `SUBGRAPH_PROTOCOL` is `Symbol.for("powerhouse.subgraph")`. `describe()` returns memoized plain schema data. `describe({ checkDeterminism: true })` also runs the determinism check, whatever `NODE_ENV` is. `bind(instance)` returns resolver bindings and scalar coercions. The host binds an instance after each successful `onSetup`, and clears the binding when it removes the instance. Unknown protocol versions are errors. The protocol works across copies of `reactor-api`.

See [Migration guide](./07-SubgraphMigrationGuide.md) and [Test a subgraph without a host](./09-TestingSubgraphs.md).
