import type { Context } from "@powerhousedao/reactor-api";
import { buildASTSchema, GraphQLError, validateSchema } from "graphql";
import { describe, expect, it } from "vitest";
import {
  createPortleSubgraph,
  gateFactsOf,
  PORTLE_SUBGRAPH_NAME,
  portleTypeDefs,
  readiness,
  type PortleApi,
} from "../src/subgraph.js";

const ADMIN = "0xabc0000000000000000000000000000000000001";

function apiOf(
  overrides: Partial<{
    policy: "OPEN" | "ADMIN_ONLY" | "DOCUMENT_PERMISSIONS";
    admins: string[];
    defaultProtection: boolean;
    identityResolved: boolean;
    requireAuthenticatedCaller: boolean;
  }> = {},
): PortleApi {
  const facts = {
    policy: "ADMIN_ONLY" as const,
    admins: [ADMIN],
    defaultProtection: false,
    identityResolved: true,
    requireAuthenticatedCaller: true,
    ...overrides,
  };
  return {
    authorizationService: {
      config: {
        policy: facts.policy,
        admins: facts.admins,
        defaultProtection: facts.defaultProtection,
      },
    } as unknown as PortleApi["authorizationService"],
    authService: facts.identityResolved ? {} : undefined,
    requireAuthenticatedCaller: facts.requireAuthenticatedCaller,
    relationalDb: {} as PortleApi["relationalDb"],
  };
}

function ctxOf(address?: string): Context {
  return {
    headers: {},
    db: undefined,
    user: address
      ? { address, chainId: 1, networkId: "eip155", appKey: "did:key:z" }
      : undefined,
  } as unknown as Context;
}

describe("gateFactsOf", () => {
  it("reads the resolved settings, with identity resolution as the auth service's presence", () => {
    expect(gateFactsOf(apiOf())).toEqual({
      policy: "ADMIN_ONLY",
      admins: [ADMIN],
      defaultProtection: false,
      identityResolved: true,
      requireAuthenticatedCaller: true,
    });
    expect(
      gateFactsOf(apiOf({ identityResolved: false })).identityResolved,
    ).toBe(false);
  });
});

describe("portle subgraph", () => {
  it("has a valid schema with the readiness query", () => {
    const schema = buildASTSchema(portleTypeDefs);
    expect(validateSchema(schema)).toEqual([]);
    expect(schema.getQueryType()?.getFields().portleReadiness).toBeDefined();
  });

  it("is a plain subgraph named portle with the host's relational db", () => {
    const api = apiOf();
    const subgraph = createPortleSubgraph(api);
    expect(subgraph.name).toBe(PORTLE_SUBGRAPH_NAME);
    expect(subgraph.typeDefs).toBe(portleTypeDefs);
    expect(subgraph.relationalDb).toBe(api.relationalDb);
    expect(subgraph.hasSubscriptions).toBe(false);
    const query = subgraph.resolvers.Query as { portleReadiness: unknown };
    expect(typeof query.portleReadiness).toBe("function");
  });

  it("answers a listed admin on a locked host: publishable", () => {
    const report = readiness(apiOf(), ctxOf(ADMIN));
    expect(report.publishable).toBe(true);
    expect(report.me).toEqual({ address: ADMIN, isAdmin: true });
  });

  it("refuses anyone but a listed admin under a non-OPEN policy", () => {
    expect(() => readiness(apiOf(), ctxOf())).toThrow(GraphQLError);
    expect(() =>
      readiness(apiOf(), ctxOf("0x0000000000000000000000000000000000000002")),
    ).toThrow(/admins/);
    try {
      readiness(apiOf(), ctxOf());
    } catch (error) {
      expect((error as GraphQLError).extensions.code).toBe("FORBIDDEN");
    }
  });

  it("answers everyone under OPEN, never publishable", () => {
    const anonymous = readiness(apiOf({ policy: "OPEN" }), ctxOf());
    expect(anonymous.publishable).toBe(false);
    expect(anonymous.me).toEqual({ address: null, isAdmin: false });
    const admin = readiness(apiOf({ policy: "OPEN" }), ctxOf(ADMIN));
    expect(admin.publishable).toBe(false);
    expect(admin.me.isAdmin).toBe(true);
    expect(admin.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual([
      "policy",
    ]);
  });

  it("the resolver hands the request context through", () => {
    const subgraph = createPortleSubgraph(apiOf());
    const query = subgraph.resolvers.Query as {
      portleReadiness: (
        parent: unknown,
        args: unknown,
        ctx: Context,
      ) => ReturnType<typeof readiness>;
    };
    const resolve = query.portleReadiness;
    expect(resolve(undefined, {}, ctxOf(ADMIN)).publishable).toBe(true);
  });
});
