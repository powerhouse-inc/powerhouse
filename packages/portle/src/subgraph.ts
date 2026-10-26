import type { API, Context, ISubgraph } from "@powerhousedao/reactor-api";
import { GraphQLError, parse } from "graphql";
import {
  evaluateGate,
  isListedAdmin,
  type GateFacts,
  type GateReport,
  type PortlePolicy,
} from "./gate.js";
import type { PortleRunnerLike, TunnelStatus } from "./runner.js";

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

  type PortleSupervised {
    name: String!
    command: String!
    running: Boolean!
    pid: Int
    startedAt: String
    restarts: Int!
    lastExitCode: Int
    lastExitSignal: String
    lastExitAt: String
  }

  type PortleTunnel {
    """
    down, degraded (one of the two processes), or up
    """
    state: String!
    frpc: PortleSupervised
    caddy: PortleSupervised
  }

  type PortleDelegation {
    zone: String!
    nameservers: [String!]!
    """
    Whether the zone's NS records already point at the relay, as this
    machine's resolver sees it. Known on portleStatus; null elsewhere.
    """
    delegated: Boolean
  }

  type PortleListen {
    https: Int!
    http: Int!
  }

  type PortleUpstream {
    label: String!
    target: String!
  }

  type PortleSettings {
    controlPlaneUrl: String!
    appUpstream: String!
    upstreams: [PortleUpstream!]!
    dns01Mode: String!
    listen: PortleListen!
    rewriteHostHeader: Boolean!
    autostart: Boolean!
  }

  type PortleBinaries {
    frpc: String
    caddy: String
    searched: [String!]!
  }

  type PortleStatus {
    stateDir: String!
    enrolled: Boolean!
    siteId: String
    siteZone: String
    zoneKind: String
    delegation: PortleDelegation
    settings: PortleSettings
    binaries: PortleBinaries!
    tunnel: PortleTunnel!
    urls: [String!]!
  }

  input PortleUpstreamInput {
    label: String!
    target: String!
  }

  type Query {
    """
    Whether this host may be published through Portle, check by check.
    Under an OPEN policy it answers everyone, since there is no admin to
    distinguish; under any other policy only a listed admin may ask.
    """
    portleReadiness: PortleReadiness!
    """
    The site's enrolment, settings, binaries and tunnel. Admins only.
    """
    portleStatus: PortleStatus!
  }

  type Mutation {
    """
    Enrol this project with a Portle control plane using a one-time token.
    """
    portleEnrol(controlPlaneUrl: String!, token: String!): PortleStatus!
    """
    What the tunnel exposes: the default upstream and per-label upstreams.
    """
    portleConfigure(
      appUpstream: String
      upstreams: [PortleUpstreamInput!]
      dns01Mode: String
      listenHttps: Int
      listenHttp: Int
      """
      Send the upstream's host:port as the Host header (for dev servers that
      check it, such as Vite's allowedHosts).
      """
      rewriteHostHeader: Boolean
    ): PortleStatus!
    """
    Bring the tunnel up. Refused unless every readiness check passes for the caller.
    """
    portleStart: PortleStatus!
    portleStop: PortleStatus!
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

function forbidden(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "FORBIDDEN" } });
}

export function readiness(api: PortleApi, ctx: Context): PortleReadiness {
  const facts = gateFactsOf(api);
  const address = ctx.user?.address;
  const isAdmin = isListedAdmin(facts.admins, address);
  if (facts.policy !== "OPEN" && !isAdmin) {
    throw forbidden("Portle readiness is for the host's admins.");
  }
  return {
    ...evaluateGate(facts, ctx.user),
    me: { address: address ?? null, isAdmin },
  };
}

/** Every other field: a listed admin on a host that is not OPEN. */
export function requireAdmin(api: PortleApi, ctx: Context): GateFacts {
  const facts = gateFactsOf(api);
  if (facts.policy === "OPEN") {
    throw forbidden(
      "Portle is disabled while the host's authorization policy is OPEN; lock the host down first (see portleReadiness).",
    );
  }
  if (!isListedAdmin(facts.admins, ctx.user?.address)) {
    throw forbidden("Portle is for the host's admins.");
  }
  return facts;
}

type WireUpstream = { label: string; target: string };

/** The GraphQL shape of a status: maps become lists, exits flatten. */
export function toWireStatus(
  status: TunnelStatus,
  delegated: boolean | null = null,
) {
  const supervised = (s: TunnelStatus["tunnel"]["frpc"]) =>
    s && {
      name: s.name,
      command: s.command,
      running: s.running,
      pid: s.pid,
      startedAt: s.startedAt,
      restarts: s.restarts,
      lastExitCode: s.lastExit?.code ?? null,
      lastExitSignal: s.lastExit?.signal ?? null,
      lastExitAt: s.lastExit?.at ?? null,
    };
  return {
    ...status,
    delegation: status.delegation && { ...status.delegation, delegated },
    settings: status.settings && {
      ...status.settings,
      rewriteHostHeader: status.settings.rewriteHostHeader ?? false,
      upstreams: Object.entries(status.settings.upstreams).map(
        ([label, target]): WireUpstream => ({ label, target }),
      ),
    },
    tunnel: {
      state: status.tunnel.state,
      frpc: supervised(status.tunnel.frpc),
      caddy: supervised(status.tunnel.caddy),
    },
  };
}

export interface PortleSubgraphDeps {
  api: PortleApi;
  runner: PortleRunnerLike;
}

/**
 * The `portle` subgraph as a plain `ISubgraph`: no reactor reads, no setup,
 * so it needs none of `BaseSubgraph` and keeps the plugin free of runtime
 * imports from reactor-api.
 */
export function createPortleSubgraph({
  api,
  runner,
}: PortleSubgraphDeps): ISubgraph {
  const guarded =
    <A, R>(run: (args: A, ctx: Context, facts: GateFacts) => R) =>
    (_parent: unknown, args: A, ctx: Context): R =>
      run(args, ctx, requireAdmin(api, ctx));

  return {
    name: PORTLE_SUBGRAPH_NAME,
    typeDefs: portleTypeDefs,
    relationalDb: api.relationalDb,
    hasSubscriptions: false,
    resolvers: {
      Query: {
        portleReadiness: (_parent: unknown, _args: unknown, ctx: Context) =>
          readiness(api, ctx),
        portleStatus: guarded(async () =>
          toWireStatus(runner.status(), await runner.checkDelegation()),
        ),
      },
      Mutation: {
        portleEnrol: guarded(
          async (args: { controlPlaneUrl: string; token: string }) =>
            toWireStatus(
              await runner.enrol({
                controlPlaneUrl: args.controlPlaneUrl,
                token: args.token,
              }),
            ),
        ),
        portleConfigure: guarded(
          (args: {
            appUpstream?: string | null;
            upstreams?: WireUpstream[] | null;
            dns01Mode?: string | null;
            listenHttps?: number | null;
            listenHttp?: number | null;
            rewriteHostHeader?: boolean | null;
          }) =>
            toWireStatus(
              runner.configure({
                ...(args.appUpstream ? { appUpstream: args.appUpstream } : {}),
                ...(args.upstreams
                  ? {
                      upstreams: Object.fromEntries(
                        args.upstreams.map((u) => [
                          u.label.toLowerCase(),
                          u.target,
                        ]),
                      ),
                    }
                  : {}),
                ...(args.dns01Mode
                  ? { dns01Mode: args.dns01Mode as "rfc2136" | "acmedns" }
                  : {}),
                ...(args.listenHttps != null || args.listenHttp != null
                  ? {
                      listen: {
                        https: args.listenHttps ?? 443,
                        http: args.listenHttp ?? 80,
                      },
                    }
                  : {}),
                ...(args.rewriteHostHeader != null
                  ? { rewriteHostHeader: args.rewriteHostHeader }
                  : {}),
              }),
            ),
        ),
        portleStart: guarded(
          async (_args: unknown, ctx: Context, facts: GateFacts) => {
            const report = evaluateGate(facts, ctx.user);
            if (!report.publishable) {
              const failing = report.checks
                .filter((c) => !c.ok)
                .map((c) => c.id);
              throw forbidden(
                `The publication gate is not met (${failing.join(", ")}); see portleReadiness.`,
              );
            }
            return toWireStatus(await runner.start());
          },
        ),
        portleStop: guarded(async () => toWireStatus(await runner.stop())),
      },
    },
  };
}
