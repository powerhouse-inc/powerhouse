# Test a subgraph without a host

Test a class through its protocol with no HTTP server or `GraphQLManager`. Use `describe()` to inspect the schema without constructing an instance. To execute a query, construct the instance, await setup, then call `bind(instance)`.

## Execute a resolver

Install the package's test dependencies if they are not present:

```bash
pnpm add -D @apollo/subgraph graphql @types/node
```

Save this test as `subgraphs/counter.test.mts` and run it with `pnpm test`:

```typescript
import { it, expect } from "vitest";
import { createRequire } from "node:module";
import { buildSubgraphSchema, type GraphQLResolverMap } from "@apollo/subgraph";
import {
  BaseSubgraph,
  SUBGRAPH_PROTOCOL,
  type Context,
  type SchemaBuilder,
  type SubgraphArgs,
} from "@powerhousedao/reactor-api";
import { ph } from "document-model";
import type * as GraphQL from "graphql";

const { graphql, GraphQLScalarType } = createRequire(import.meta.url)(
  "graphql",
) as typeof GraphQL;

class CounterSubgraph extends BaseSubgraph<Context> {
  static override readonly subgraphName = "counter";
  #count = 0;

  static override getSchema(schema: SchemaBuilder<CounterSubgraph>) {
    return [
      schema.query("counterValue", {
        returns: ph.Int({ required: true }),
        resolve: ({ subgraph }) => subgraph.#count,
      }),
    ];
  }

  override async onSetup(): Promise<void> {
    await super.onSetup();
    this.#count = 42;
  }

  override async onDisconnect(): Promise<void> {
    this.#count = 0;
    await super.onDisconnect();
  }
}

it("serves counterValue after setup", async () => {
  const protocol = CounterSubgraph[SUBGRAPH_PROTOCOL]();
  const description = protocol.describe();
  expect(description.subgraphName).toBe("counter");
  expect(description.hasSubscriptions).toBe(false);

  // This fixture never calls host services. Supply service mocks when a resolver uses them.
  const instance = new CounterSubgraph({} as SubgraphArgs);
  try {
    await instance.onSetup();
    const binding = protocol.bind(instance);
    const resolvers = { ...binding.resolvers } as GraphQLResolverMap<Context>;
    for (const coercion of binding.scalarCoercions) {
      resolvers[coercion.name] = new GraphQLScalarType({ ...coercion });
    }
    const schema = buildSubgraphSchema([
      {
        typeDefs: description.typeDefs as GraphQL.DocumentNode,
        resolvers,
      },
    ]);
    const result = await graphql({
      schema,
      source: "{ counterValue }",
      contextValue: { headers: {}, db: {} },
    });
    expect(result.errors).toBeUndefined();
    expect(result.data?.counterValue).toBe(42);
  } finally {
    await instance.onDisconnect();
  }
});
```

`buildSubgraphSchema` takes an array of schema modules, each with `typeDefs` and `resolvers`. Do not pass the protocol's description or binding as the whole input.

Apollo's schema builder uses CommonJS `graphql`. `createRequire` selects that same copy for query execution and scalar construction. Mixing ESM and CommonJS GraphQL class instances can produce a duplicate-module error.

The protocol's AST and resolver map have library-independent types. This test adapts them to Apollo's types at the boundary. Rebuilding scalars from `scalarCoercions` preserves their behavior with the executor's GraphQL copy.

The empty `SubgraphArgs` assertion is limited to this service-free fixture. A resolver that uses host services needs mocks for those services or a real embedded Reactor. Do not use empty arguments in a host.

## Cover lifecycle and authorization

Call `onDisconnect()` in `finally`, including when setup throws. Verify that teardown releases only resources the instance acquired and tolerates partial setup. The host uses the same cleanup rule after setup failure. It does not call this hook on process shutdown.

For authorization, execute the same query with an allowed caller, a denied caller, and an anonymous caller. Assert both the result and the absence of withheld document ids. Test SDL resolver factories after setup so they can read initialized instance fields.

For a custom scalar, test variables, literals, and output serialization. When you migrate a subgraph, see [Migration guide](./07-SubgraphMigrationGuide.md).
