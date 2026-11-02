import type { Context } from "@powerhousedao/reactor-api";
import type { PortleRunnerLike, TunnelStatus } from "../src/runner.js";
import type { EnrollmentResponse } from "../src/site/types.js";
import type { PortleApi } from "../src/subgraph.js";

export const ADMIN = "0xabc0000000000000000000000000000000000001";
export const STRANGER = "0x0000000000000000000000000000000000000002";

export const enrollment: EnrollmentResponse = {
  siteId: "s1aaaaaaaa",
  siteSecret: "deadbeef",
  siteZone: "dev.sektar.be",
  zoneKind: "customer",
  delegation: {
    zone: "dev.sektar.be",
    nameservers: ["ns1.relaytest.portle.host."],
  },
  frp: {
    serverAddr: "relay1.relaytest.portle.host",
    serverPort: 7000,
    token: "tok",
    caPem: "-----BEGIN CERTIFICATE-----\nAA\n-----END CERTIFICATE-----\n",
    serverName: "relay1.relaytest.portle.host",
  },
  dns: {
    tsigKeyName: "site-s1aaaaaaaa.dev.sektar.be",
    tsigAlgorithm: "hmac-sha256",
    tsigSecret: "c2VjcmV0",
    server: "204.168.235.130:53",
    resolvers: ["204.168.235.130"],
  },
  acmeDns: {
    baseUrl: "https://cp-relaytest.portle.host/v1/acmedns",
    username: "u",
    password: "p",
    fullDomain: "_acme-challenge.dev.sektar.be",
    subdomain: "s1aaaaaaaa",
  },
  acme: {
    caUrl: "https://acme-staging-v02.api.letsencrypt.org/directory",
    email: "ops@portle.host",
  },
};

export type Facts = {
  policy: "OPEN" | "ADMIN_ONLY" | "DOCUMENT_PERMISSIONS";
  admins: string[];
  defaultProtection: boolean;
  identityResolved: boolean;
  requireAuthenticatedCaller: boolean;
};

export function apiOf(overrides: Partial<Facts> = {}): PortleApi {
  const facts: Facts = {
    policy: "ADMIN_ONLY",
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

export function ctxOf(address?: string): Context {
  return {
    headers: {},
    db: undefined,
    user: address
      ? { address, chainId: 1, networkId: "eip155", appKey: "did:key:z" }
      : undefined,
  } as unknown as Context;
}

export function statusOf(overrides: Partial<TunnelStatus> = {}): TunnelStatus {
  return {
    stateDir: "/p/.ph/portle",
    enrolled: false,
    siteId: null,
    siteZone: null,
    zoneKind: null,
    delegation: null,
    settings: null,
    binaries: { frpc: null, caddy: null, searched: [] },
    tunnel: { state: "down", frpc: null, caddy: null },
    urls: [],
    ...overrides,
  };
}

/** A runner that records calls and answers a fixed status. */
export function fakeRunner(
  status: TunnelStatus = statusOf(),
): PortleRunnerLike & {
  calls: string[];
  status_: TunnelStatus;
  delegated: boolean | null;
} {
  const runner = {
    calls: [] as string[],
    status_: status,
    delegated: null as boolean | null,
    checkDelegation: () => Promise.resolve(runner.delegated),
    status: () => runner.status_,
    enrol: (input: { controlPlaneUrl: string; token: string }) => {
      runner.calls.push(`enrol ${input.controlPlaneUrl} ${input.token}`);
      runner.status_ = { ...runner.status_, enrolled: true };
      return Promise.resolve(runner.status_);
    },
    configure: (patch: object) => {
      runner.calls.push(`configure ${JSON.stringify(patch)}`);
      return runner.status_;
    },
    start: () => {
      runner.calls.push("start");
      runner.status_ = {
        ...runner.status_,
        tunnel: { ...runner.status_.tunnel, state: "up" },
      };
      return Promise.resolve(runner.status_);
    },
    stop: (options?: { keepAutostart?: boolean }) => {
      runner.calls.push(options?.keepAutostart ? "stop keepAutostart" : "stop");
      runner.status_ = {
        ...runner.status_,
        tunnel: { ...runner.status_.tunnel, state: "down" },
      };
      return Promise.resolve(runner.status_);
    },
  };
  return runner;
}
