import { createRequire } from "node:module";
import { ApolloGateway, LocalCompose } from "@apollo/gateway";
import type { IReactorClient } from "@powerhousedao/reactor";
import type * as GraphQL from "graphql";
import type { GraphQLError, GraphQLSchema } from "graphql";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthSubgraph } from "../src/graphql/auth/subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import type { DocumentPermissionService } from "../src/services/document-permission.service.js";
import {
  buildSubgraphSchemaModule,
  createSchema,
} from "../src/utils/create-schema.js";

// The CommonJS build @apollo/subgraph uses; vite would hand this file the ESM one.
const { graphql } = createRequire(import.meta.url)("graphql") as typeof GraphQL;

type Call = { method: string; args: unknown[] };

const VALUE = "ref-value";

type Pair = {
  field: string;
  kind: "query" | "mutation";
  /** The field selection, given the pair's argument text. */
  source: (args: string) => string;
};

const PAIRS: Pair[] = [
  {
    field: "documentAccess",
    kind: "query",
    source: (a) => `documentAccess(${a}) { documentId }`,
  },
  {
    field: "documentProtection",
    kind: "query",
    source: (a) => `documentProtection(${a}) { documentId }`,
  },
  {
    field: "operationPermissions",
    kind: "query",
    source: (a) =>
      `operationPermissions(${a} operationType: "o") { documentId }`,
  },
  {
    field: "canExecuteOperation",
    kind: "query",
    source: (a) => `canExecuteOperation(${a} operationType: "o")`,
  },
  {
    field: "setDocumentProtection",
    kind: "mutation",
    source: (a) => `setDocumentProtection(${a} protected: true) { documentId }`,
  },
  {
    field: "transferDocumentOwnership",
    kind: "mutation",
    source: (a) =>
      `transferDocumentOwnership(${a} newOwnerAddress: "0x1") { documentId }`,
  },
  {
    field: "grantDocumentPermission",
    kind: "mutation",
    source: (a) =>
      `grantDocumentPermission(${a} userAddress: "0x1" permission: READ) { documentId }`,
  },
  {
    field: "revokeDocumentPermission",
    kind: "mutation",
    source: (a) => `revokeDocumentPermission(${a} userAddress: "0x1")`,
  },
  {
    field: "grantOperationPermission",
    kind: "mutation",
    source: (a) =>
      `grantOperationPermission(${a} operationType: "o" userAddress: "0x1") { documentId }`,
  },
  {
    field: "revokeOperationPermission",
    kind: "mutation",
    source: (a) =>
      `revokeOperationPermission(${a} operationType: "o" userAddress: "0x1")`,
  },
];

/** Every method records its call and throws, so a call shows what reached it. */
function recorder<T extends object>(calls: Call[]): T {
  return new Proxy({} as T, {
    get: (_target, prop) => {
      if (typeof prop !== "string" || prop === "then") return undefined;
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        throw new Error(`stub: ${prop}`);
      };
    },
  });
}

function buildSubgraph(calls: Call[]): AuthSubgraph {
  return new AuthSubgraph({
    reactorClient: recorder<IReactorClient>(calls),
    documentPermissionService: recorder<DocumentPermissionService>(calls),
    authorizationService: createAuthorizationService({
      admins: [],
      defaultProtection: false,
      policy: AuthorizationPolicy.OPEN,
    }),
  } as unknown as SubgraphArgs);
}

const ctx = { headers: {}, db: null } as unknown as Context;

function aliasErrors(errors: readonly GraphQLError[] | undefined) {
  return (errors ?? []).filter(
    (error) => error.extensions.code === "BAD_USER_INPUT",
  );
}

describe("auth subgraph argument names", () => {
  let calls: Call[];
  let schema: GraphQLSchema;

  beforeEach(() => {
    calls = [];
    const subgraph = buildSubgraph(calls);
    schema = createSchema([], subgraph.resolvers, subgraph.typeDefs);
  });

  function run(pair: Pair, args: string) {
    return graphql({
      schema,
      source: `${pair.kind} { ${pair.source(args).replace(/\(\s*\)/, "")} }`,
      contextValue: ctx,
    });
  }

  describe.each(PAIRS)("$field(documentIdOrSlug | documentId)", (pair) => {
    const literal = JSON.stringify(VALUE);

    it.each(["documentId", "documentIdOrSlug"])("accepts %s", async (name) => {
      const result = await run(pair, `${name}: ${literal}`);

      expect(aliasErrors(result.errors)).toEqual([]);
      expect(calls).toContainEqual({
        method: "resolveIdOrSlug",
        args: [VALUE],
      });
    });

    it("refuses both with BAD_USER_INPUT", async () => {
      const result = await run(
        pair,
        `documentIdOrSlug: ${literal} documentId: ${literal}`,
      );

      expect(aliasErrors(result.errors)).toMatchObject([
        {
          message: "Pass documentIdOrSlug or documentId, not both.",
          path: [pair.field],
        },
      ]);
      expect(calls).toEqual([]);
    });

    it("refuses neither with BAD_USER_INPUT", async () => {
      const result = await run(pair, "");

      expect(aliasErrors(result.errors)).toMatchObject([
        { message: "documentIdOrSlug is required.", path: [pair.field] },
      ]);
      expect(calls).toEqual([]);
    });
  });

  it("keeps deprecations in the composed API schema", async () => {
    const subgraph = buildSubgraph([]);
    const gateway = new ApolloGateway({
      supergraphSdl: new LocalCompose({
        localServiceList: [
          {
            name: "auth",
            typeDefs: buildSubgraphSchemaModule(
              [],
              subgraph.resolvers,
              subgraph.typeDefs,
            ).typeDefs,
            url: "http://localhost/auth",
          },
        ],
      }),
    });

    try {
      const { schema: api } = await gateway.load();

      for (const pair of PAIRS) {
        const root =
          pair.kind === "query" ? api.getQueryType() : api.getMutationType();
        const field = root?.getFields()[pair.field];
        if (!field) throw new Error(pair.field);
        const reasons = Object.fromEntries(
          field.args.map((arg) => [arg.name, arg.deprecationReason ?? null]),
        );
        expect(reasons, pair.field).toMatchObject({
          documentIdOrSlug: null,
          documentId: "Use documentIdOrSlug.",
        });
      }
    } finally {
      await gateway.stop();
    }
  });
});
