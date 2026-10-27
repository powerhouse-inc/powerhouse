import type { API, Context, ISubgraph } from "@powerhousedao/reactor-api";
import { GraphQLError, parse } from "graphql";
import {
  evaluateGate,
  isListedAdmin,
  type GateFacts,
  type GateReport,
  type PortlePolicy,
} from "./gate.js";

/** The slice of the switchboard's API object the subgraph reads. */
export type PortleApi = Pick<
  API,
  "authorizationService" | "requireAuthenticatedCaller" | "relationalDb"
> & {
  /** Present exactly when the host resolves caller identity. */
  authService: unknown;
};

export const PORTLE_SUBGRAPH_NAME = "portle";

export const portleTypeDefs = parse(/* GraphQL */ `
  type PortleCheck {
    id: String!
    ok: Boolean!
    detail: String!
    fix: String
  }

  type PortleCaller {
    address: String
    isAdmin: Boolean!
  }

  type PortleReadiness {
    publishable: Boolean!
    checks: [PortleCheck!]!
    warnings: [PortleCheck!]!
    me: PortleCaller!
  }

  type Query {
    """
    Whether this host may be published through Portle, check by check.
    Under an OPEN policy it answers everyone, since there is no admin to
    distinguish; under any other policy only a listed admin may ask.
    """
    portleReadiness: PortleReadiness!
  }
`);

/** The host's authorization facts, read off the API object. */
export function gateFactsOf(api: PortleApi): GateFacts {
  const config = api.authorizationService.config;
  return {
    policy: config.policy as PortlePolicy,
    admins: config.admins,
    defaultProtection: config.defaultProtection,
    identityResolved: api.authService !== undefined,
    requireAuthenticatedCaller: api.requireAuthenticatedCaller,
  };
}

export type PortleReadiness = GateReport & {
  me: { address: string | null; isAdmin: boolean };
};

export function readiness(api: PortleApi, ctx: Context): PortleReadiness {
  const facts = gateFactsOf(api);
  const address = ctx.user?.address;
  const isAdmin = isListedAdmin(facts.admins, address);
  if (facts.policy !== "OPEN" && !isAdmin) {
    throw new GraphQLError("Portle readiness is for the host's admins.", {
      extensions: { code: "FORBIDDEN" },
    });
  }
  return {
    ...evaluateGate(facts, ctx.user),
    me: { address: address ?? null, isAdmin },
  };
}

/**
 * The `portle` subgraph as a plain `ISubgraph`: no reactor reads, no setup,
 * so it needs none of `BaseSubgraph` and keeps the plugin free of runtime
 * imports from reactor-api.
 */
export function createPortleSubgraph(api: PortleApi): ISubgraph {
  return {
    name: PORTLE_SUBGRAPH_NAME,
    typeDefs: portleTypeDefs,
    relationalDb: api.relationalDb,
    hasSubscriptions: false,
    resolvers: {
      Query: {
        portleReadiness: (_parent: unknown, _args: unknown, ctx: Context) =>
          readiness(api, ctx),
      },
    },
  };
}
