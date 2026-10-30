import { gql } from "graphql-tag";
import { Kysely, PostgresDialect, type RawBuilder } from "kysely";
import { describe, expect, it, vi } from "vitest";
import {
  assertIndexAccessComplete,
  defineIndexSubgraph,
  type IndexQuery,
} from "../src/graphql/index-subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import { AuthorizationPolicy } from "../src/services/authorization.service.js";
import type { ReadableFilter } from "../src/services/readable-documents.js";

const typeDefs = gql`
  type Row {
    id: String!
  }
  type MailQueries {
    messages(driveId: String!, limit: Int): [Row!]!
    accounts(driveId: String!): [Row!]!
    version: String!
  }
  type Query {
    mail: MailQueries!
  }
`;

/** A query builder that records what `restrict` does to it. */
function builder() {
  const calls: unknown[][] = [];
  const q = {
    calls,
    where: (...args: unknown[]) => {
      calls.push(args);
      return q;
    },
  };
  return q;
}

type Db = { drive: string };

// Compiles a raw where expression to text; no connection is made.
const compiler = new Kysely<unknown>({
  dialect: new PostgresDialect({ pool: {} as never }),
});
const text = (where: unknown): string => {
  const compiled = (where as RawBuilder<unknown>).compile(compiler);
  return `${compiled.sql} ${JSON.stringify(compiled.parameters)}`;
};

const complete = {
  name: "mail",
  typeDefs,
  index: (driveId: string): Db => ({ drive: driveId }),
  access: {
    scope: { drive: "driveId" },
    fields: {
      "MailQueries.messages": {
        rows: "document" as const,
        column: "document_id",
      },
      "MailQueries.accounts": {
        rows: "derived" as const,
        column: "document_id",
        passWhen: { column: "kind", equals: "folder" },
      },
      "MailQueries.version": { public: true as const },
    },
  },
  resolvers: { Query: { mail: () => ({}) } },
  queries: {
    "MailQueries.messages": ({ db, args, restrict }: IndexQuery<Db>) => ({
      db,
      args,
      q: restrict(builder()),
    }),
    "MailQueries.accounts": ({ restrict, access }: IndexQuery<Db>) => ({
      q: restrict(builder(), "account_id"),
      access,
    }),
    "MailQueries.version": ({ restrict, access }: IndexQuery<Db>) => ({
      q: restrict(builder()),
      access,
    }),
  },
};

/** A subgraph instance whose readable-documents filter is what the test says. */
function instanceOf(
  Subgraph: ReturnType<typeof defineIndexSubgraph>,
  filter: ReadableFilter,
  listed = true,
) {
  const relationalDb = {} as never;
  const args = {
    http: {} as never,
    relationalDb,
    analyticsStore: {} as never,
    graphqlManager: {} as never,
    syncManager: {} as never,
    authorizationService: {
      config: {
        policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
        admins: [],
        defaultProtection: false,
      },
    } as never,
    readableDocuments: {
      schema: "s",
      ready: Promise.resolve(),
      filterFor: () => filter,
    },
  } satisfies Partial<SubgraphArgs>;
  const subgraph = new Subgraph(args as unknown as SubgraphArgs);
  // the scope gate is the read model's business; stand it in
  vi.spyOn(subgraph, "indexAccess").mockImplementation(() =>
    Promise.resolve(listed ? filter : { kind: "none" }),
  );
  return subgraph;
}

const ctx = { user: { address: "0xu" } } as unknown as Context;

describe("defineIndexSubgraph", () => {
  it("refuses a definition with an undeclared field, a missing handler, a stray key or a field without the scope argument", () => {
    const fields = { ...complete.access.fields };
    delete (fields as Record<string, unknown>)["MailQueries.accounts"];
    const queries = { ...complete.queries, "MailQueries.extra": () => null };
    delete (queries as Record<string, unknown>)["MailQueries.version"];
    expect(() =>
      assertIndexAccessComplete({
        ...complete,
        access: {
          ...complete.access,
          fields: { ...fields, "Nope.field": { public: true } },
        },
        queries,
      }),
    ).toThrow(
      /MailQueries\.accounts: no access entry[\s\S]*MailQueries\.version: no query handler[\s\S]*Nope\.field: declared, but not a query field[\s\S]*MailQueries\.extra: has a handler, but is not a query field/,
    );
    expect(() =>
      assertIndexAccessComplete({
        ...complete,
        access: { ...complete.access, scope: { drive: "drive" } },
      }),
    ).toThrow(/MailQueries\.messages: takes no "drive" argument/);
    expect(() => assertIndexAccessComplete(complete)).not.toThrow();
  });

  it("builds a subgraph class the registry recognises, with the extra resolvers kept", () => {
    const Subgraph = defineIndexSubgraph(complete);
    const subgraph = instanceOf(Subgraph, { kind: "all" });
    expect(subgraph.name).toBe("mail");
    expect(subgraph.typeDefs).toBe(typeDefs);
    expect(Object.keys(subgraph.resolvers)).toEqual(["Query", "MailQueries"]);
    expect(
      (subgraph.resolvers.Query as { mail: () => unknown }).mail(),
    ).toEqual({});
  });

  it("hands the handler the drive's builder, the arguments and a restrict bound to the caller", async () => {
    const Subgraph = defineIndexSubgraph(complete);
    const filter: ReadableFilter = { kind: "ids", schema: "s", userId: "0xu" };
    const subgraph = instanceOf(Subgraph, filter);
    const messages = subgraph.resolvers.MailQueries.messages as (
      p: unknown,
      a: unknown,
      c: Context,
    ) => Promise<{ db: Db; args: unknown; q: ReturnType<typeof builder> }>;
    const out = await messages({}, { driveId: "d1", limit: 5 }, ctx);
    expect(out.db).toEqual({ drive: "d1" });
    expect(out.args).toEqual({ driveId: "d1", limit: 5 });
    // one where, with the field's column in the readable-ids subquery
    expect(out.q.calls).toHaveLength(1);
    const where = text(out.q.calls[0][0]);
    expect(where).toContain("document_id");
    expect(where).toContain("readable_documents");
  });

  it("lets a handler name another column, and a declared passWhen rides along", async () => {
    const Subgraph = defineIndexSubgraph(complete);
    const subgraph = instanceOf(Subgraph, {
      kind: "ids",
      schema: "s",
      userId: "0xu",
    });
    const accounts = subgraph.resolvers.MailQueries.accounts as (
      p: unknown,
      a: unknown,
      c: Context,
    ) => Promise<{ q: ReturnType<typeof builder> }>;
    const out = await accounts({}, { driveId: "d1" }, ctx);
    const where = text(out.q.calls[0][0]);
    expect(where).toContain("account_id");
    expect(where).toContain("folder");
  });

  it("restricts to nothing when the scope refuses the caller, and never branches in the handler", async () => {
    const Subgraph = defineIndexSubgraph(complete);
    const subgraph = instanceOf(
      Subgraph,
      { kind: "ids", schema: "s", userId: "0xu" },
      false,
    );
    const messages = subgraph.resolvers.MailQueries.messages as (
      p: unknown,
      a: unknown,
      c: Context,
    ) => Promise<{ q: ReturnType<typeof builder> }>;
    const out = await messages({}, { driveId: "d1" }, ctx);
    expect(out.q.calls).toHaveLength(1);
    expect(text(out.q.calls[0][0])).toContain("false");
  });

  it("leaves a public field alone: no scope gate, no restriction", async () => {
    const Subgraph = defineIndexSubgraph(complete);
    const subgraph = instanceOf(Subgraph, { kind: "none" }, false);
    const version = subgraph.resolvers.MailQueries.version as (
      p: unknown,
      a: unknown,
      c: Context,
    ) => Promise<{ q: ReturnType<typeof builder>; access: ReadableFilter }>;
    const out = await version({}, { driveId: "d1" }, ctx);
    expect(out.q.calls).toHaveLength(0);
    expect(out.access).toEqual({ kind: "all" });
    expect(subgraph.indexAccess).not.toHaveBeenCalled();
  });
});
