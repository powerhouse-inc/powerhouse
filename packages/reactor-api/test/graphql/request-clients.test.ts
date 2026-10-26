import type {
  IReactorReadClient,
  IReactorWriteClient,
} from "@powerhousedao/reactor";
import { createRequire } from "node:module";
import type * as GraphQL from "graphql";
import { gql } from "graphql-tag";
import { describe, expect, it } from "vitest";
import {
  createRequestClients,
  readOnlyClients,
  RequestClientBinder,
  WriteClientUnavailableError,
  type RequestClients,
} from "../../src/graphql/request-clients.js";
import type { Context } from "../../src/graphql/types.js";
import { createSchema } from "../../src/utils/create-schema.js";

// The CommonJS build @apollo/subgraph uses; vite would hand this file the ESM one.
const { graphql, subscribe, parse } = createRequire(import.meta.url)(
  "graphql",
) as typeof GraphQL;

const read = { name: "read" } as unknown as IReactorReadClient;
const write = { name: "write" } as unknown as IReactorWriteClient;

const typeDefs = gql`
  type Query {
    reads: String
    writes: String
    writeSide: String
    seen: [String]
  }
  type Mutation {
    writes: String
    nested: Nested
  }
  type Nested {
    writes: String
  }
  type Subscription {
    ticks: String
  }
`;

const nameOf = (client: unknown) => (client as { name: string }).name;

/** Resolvers reaching for the clients, recording the contexts they see. */
function resolvers(seen: object[]) {
  const writes = (_: unknown, __: unknown, ctx: Context) =>
    nameOf(ctx.clients.write);
  return {
    Query: {
      reads: (_: unknown, __: unknown, ctx: Context) => {
        seen.push(ctx);
        return nameOf(ctx.clients.read);
      },
      writes,
      writeSide: writes,
      seen: (_: unknown, __: unknown, ctx: Context) => {
        seen.push(ctx);
        return [];
      },
    },
    Mutation: {
      writes,
      nested: () => ({}),
    },
    Nested: { writes },
    Subscription: {
      ticks: {
        // A source whose first read reaches for the write half.
        subscribe: (_: unknown, __: unknown, ctx: Context) => ({
          [Symbol.asyncIterator]() {
            return this;
          },
          next: () =>
            new Promise((resolve) =>
              resolve({
                value: { ticks: nameOf(ctx.clients.write) },
                done: false,
              }),
            ),
          return: () => Promise.resolve({ value: undefined, done: true }),
        }),
      },
    },
  };
}

function boundSchema(seen: object[] = []) {
  const binder = new RequestClientBinder(read, write);
  const schema = createSchema(
    [],
    binder.bindResolvers(resolvers(seen), new Set(["Query.writeSide"])),
    typeDefs,
  );
  const base = {
    headers: {},
    db: null,
    clients: binder.unboundClients(),
  } as Context;
  return { schema, base };
}

describe("the clients on the GraphQL context", () => {
  it("hands a query the read half", async () => {
    const { schema, base } = boundSchema();
    const result = await graphql({
      schema,
      source: "{ reads }",
      contextValue: base,
    });
    expect(result).toEqual({ data: { reads: "read" } });
  });

  it("refuses a query resolver the write half, naming the field", async () => {
    const { schema, base } = boundSchema();
    const result = await graphql({
      schema,
      source: "{ writes }",
      contextValue: base,
    });
    expect(result.errors?.[0]?.message).toBe(
      "ctx.clients.write is only available to Mutation fields; field Query.writes runs in a query. Read through ctx.clients.read.",
    );
    expect(
      WriteClientUnavailableError.isError(result.errors?.[0]?.originalError),
    ).toBe(true);
  });

  it("hands a mutation the write half, nested fields included", async () => {
    const { schema, base } = boundSchema();
    const result = await graphql({
      schema,
      source: "mutation { writes nested { writes } }",
      contextValue: base,
    });
    expect(result).toEqual({
      data: { writes: "write", nested: { writes: "write" } },
    });
  });

  it("refuses a subscription the write half", async () => {
    const { schema, base } = boundSchema();
    const stream = (await subscribe({
      schema,
      document: parse("subscription { ticks }"),
      contextValue: base,
    })) as AsyncIterableIterator<GraphQL.ExecutionResult>;
    // The source runs when the stream is first read, so the refusal surfaces
    // there.
    await expect(stream.next()).rejects.toThrow("runs in a subscription");
  });

  it("hands a declared write-side query field the write half", async () => {
    const { schema, base } = boundSchema();
    const result = await graphql({
      schema,
      source: "{ writeSide }",
      contextValue: base,
    });
    expect(result).toEqual({ data: { writeSide: "write" } });
  });

  it("gives every field of one operation the same context", async () => {
    const seen: object[] = [];
    const { schema, base } = boundSchema(seen);
    await graphql({ schema, source: "{ reads seen }", contextValue: base });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
    expect(seen[0]).not.toBe(base);
  });

  it("keeps a context the host built from writing", () => {
    const { base } = boundSchema();
    expect(() => base.clients.write).toThrow(WriteClientUnavailableError);
    expect(() => base.clients.write).toThrow("outside a mutation");
  });

  it("does not trip the refusal when the clients are spread or printed", () => {
    const clients: RequestClients = readOnlyClients(read);
    expect({ ...clients }).toEqual({ read });
    expect(Object.keys(clients)).toEqual(["read"]);
    expect("write" in clients).toBe(true);
  });

  it("builds both halves for a mutation", () => {
    const clients = createRequestClients(read, write, "mutation");
    expect(clients.read).toBe(read);
    expect(clients.write).toBe(write);
  });
});
