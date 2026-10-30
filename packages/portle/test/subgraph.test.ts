import type { Context } from "@powerhousedao/reactor-api";
import { buildASTSchema, GraphQLError, validateSchema } from "graphql";
import { describe, expect, it } from "vitest";
import {
  createPortleSubgraph,
  gateFactsOf,
  PORTLE_SUBGRAPH_NAME,
  portleTypeDefs,
  readiness,
  requireAdmin,
  type toWireStatus,
} from "../src/subgraph.js";
import {
  ADMIN,
  STRANGER,
  apiOf,
  ctxOf,
  fakeRunner,
  statusOf,
} from "./fixtures.js";

type Resolver = (parent: unknown, args: unknown, ctx: Context) => unknown;

function resolversOf(subgraph: ReturnType<typeof createPortleSubgraph>) {
  const r = subgraph.resolvers as {
    Query: Record<string, Resolver>;
    Mutation: Record<string, Resolver>;
  };
  return r;
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
  it("has a valid schema with the readiness and status queries and the four mutations", () => {
    const schema = buildASTSchema(portleTypeDefs);
    expect(validateSchema(schema)).toEqual([]);
    expect(Object.keys(schema.getQueryType()!.getFields())).toEqual([
      "portleReadiness",
      "portleStatus",
    ]);
    expect(Object.keys(schema.getMutationType()!.getFields())).toEqual([
      "portleEnrol",
      "portleConfigure",
      "portleStart",
      "portleStop",
    ]);
  });

  it("is a plain subgraph named portle with the host's relational db", () => {
    const api = apiOf();
    const subgraph = createPortleSubgraph({ api, runner: fakeRunner() });
    expect(subgraph.name).toBe(PORTLE_SUBGRAPH_NAME);
    expect(subgraph.typeDefs).toBe(portleTypeDefs);
    expect(subgraph.relationalDb).toBe(api.relationalDb);
    expect(subgraph.hasSubscriptions).toBe(false);
  });

  describe("readiness", () => {
    it("answers a listed admin on a locked host: publishable", () => {
      const report = readiness(apiOf(), ctxOf(ADMIN));
      expect(report.publishable).toBe(true);
      expect(report.me).toEqual({ address: ADMIN, isAdmin: true });
    });

    it("refuses anyone but a listed admin under a non-OPEN policy", () => {
      expect(() => readiness(apiOf(), ctxOf())).toThrow(GraphQLError);
      expect(() => readiness(apiOf(), ctxOf(STRANGER))).toThrow(/admins/);
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
  });

  describe("requireAdmin", () => {
    it("refuses under OPEN even for a listed admin, and refuses strangers and anonymous callers", () => {
      expect(() =>
        requireAdmin(apiOf({ policy: "OPEN" }), ctxOf(ADMIN)),
      ).toThrow(/OPEN/);
      expect(() => requireAdmin(apiOf(), ctxOf(STRANGER))).toThrow(/admins/);
      expect(() => requireAdmin(apiOf(), ctxOf())).toThrow(/admins/);
      expect(requireAdmin(apiOf(), ctxOf(ADMIN)).policy).toBe("ADMIN_ONLY");
    });
  });

  describe("status and mutations", () => {
    it("portleStatus answers an admin with the wire shape", async () => {
      const runner = fakeRunner(
        statusOf({
          enrolled: true,
          siteZone: "dev.sektar.be",
          settings: {
            controlPlaneUrl: "https://cp",
            appUpstream: "127.0.0.1:2540",
            upstreams: { api: "127.0.0.1:7540" },
            dns01Mode: "rfc2136",
            listen: { https: 443, http: 80 },
            autostart: true,
          },
          tunnel: {
            state: "degraded",
            frpc: {
              name: "frpc",
              command: "frpc -c x",
              running: true,
              pid: 1,
              startedAt: "t",
              restarts: 2,
              lastExit: { code: 1, signal: null, at: "u" },
            },
            caddy: null,
          },
        }),
      );
      const { Query } = resolversOf(
        createPortleSubgraph({ api: apiOf(), runner }),
      );
      const status = (await Query.portleStatus(
        undefined,
        {},
        ctxOf(ADMIN),
      )) as ReturnType<typeof toWireStatus>;
      expect(status.settings?.upstreams).toEqual([
        { label: "api", target: "127.0.0.1:7540" },
      ]);
      expect(status.tunnel.frpc).toMatchObject({
        running: true,
        restarts: 2,
        lastExitCode: 1,
        lastExitSignal: null,
        lastExitAt: "u",
      });
      expect(status.tunnel.caddy).toBeNull();
      expect(() => Query.portleStatus(undefined, {}, ctxOf(STRANGER))).toThrow(
        /admins/,
      );
      expect(() => Query.portleStatus(undefined, {}, ctxOf())).toThrow(
        /admins/,
      );
    });

    it("portleEnrol and portleConfigure drive the runner for an admin only", async () => {
      const runner = fakeRunner();
      const { Mutation } = resolversOf(
        createPortleSubgraph({ api: apiOf(), runner }),
      );
      await Mutation.portleEnrol(
        undefined,
        { controlPlaneUrl: "https://cp", token: "t0k" },
        ctxOf(ADMIN),
      );
      Mutation.portleConfigure(
        undefined,
        {
          appUpstream: "127.0.0.1:2540",
          upstreams: [{ label: "API", target: "127.0.0.1:7540" }],
          dns01Mode: null,
        },
        ctxOf(ADMIN),
      );
      expect(runner.calls).toEqual([
        "enrol https://cp t0k",
        'configure {"appUpstream":"127.0.0.1:2540","upstreams":{"api":"127.0.0.1:7540"}}',
      ]);
      // the admin check runs before the resolver body, so a refusal is synchronous
      expect(() =>
        Mutation.portleEnrol(
          undefined,
          { controlPlaneUrl: "https://cp", token: "t" },
          ctxOf(STRANGER),
        ),
      ).toThrow(/admins/);
      expect(() => Mutation.portleConfigure(undefined, {}, ctxOf())).toThrow(
        /admins/,
      );
      expect(runner.calls).toHaveLength(2);
    });

    it("portleStart needs the full gate, portleStop only an admin", async () => {
      const runner = fakeRunner(statusOf({ enrolled: true }));
      const locked = resolversOf(
        createPortleSubgraph({ api: apiOf(), runner }),
      );
      const started = (await locked.Mutation.portleStart(
        undefined,
        {},
        ctxOf(ADMIN),
      )) as ReturnType<typeof toWireStatus>;
      expect(started.tunnel.state).toBe("up");
      expect(runner.calls).toEqual(["start"]);

      const noFloor = resolversOf(
        createPortleSubgraph({
          api: apiOf({ requireAuthenticatedCaller: false }),
          runner,
        }),
      );
      await expect(
        noFloor.Mutation.portleStart(
          undefined,
          {},
          ctxOf(ADMIN),
        ) as Promise<unknown>,
      ).rejects.toThrow(/gate is not met \(floor\)/);
      expect(runner.calls).toEqual(["start"]);

      const stopped = (await noFloor.Mutation.portleStop(
        undefined,
        {},
        ctxOf(ADMIN),
      )) as ReturnType<typeof toWireStatus>;
      expect(stopped.tunnel.state).toBe("down");
      expect(runner.calls).toEqual(["start", "stop"]);
      expect(() =>
        noFloor.Mutation.portleStop(undefined, {}, ctxOf(STRANGER)),
      ).toThrow(/admins/);
    });
  });
});

describe("portle subgraph: delegation and listen ports", () => {
  it("portleStatus reports whether the zone is delegated, mutations leave it null", async () => {
    const runner = fakeRunner(
      statusOf({
        enrolled: true,
        delegation: {
          zone: "dev.sektar.be",
          nameservers: ["ns1.relaytest.portle.host."],
        },
      }),
    );
    runner.delegated = false;
    const { Query, Mutation } = resolversOf(
      createPortleSubgraph({ api: apiOf(), runner }),
    );
    const status = (await Query.portleStatus(
      undefined,
      {},
      ctxOf(ADMIN),
    )) as ReturnType<typeof toWireStatus>;
    expect(status.delegation).toEqual({
      zone: "dev.sektar.be",
      nameservers: ["ns1.relaytest.portle.host."],
      delegated: false,
    });
    const stopped = (await Mutation.portleStop(
      undefined,
      {},
      ctxOf(ADMIN),
    )) as ReturnType<typeof toWireStatus>;
    expect(stopped.delegation?.delegated).toBeNull();
  });

  it("portleConfigure passes the listen ports through, defaulting the one not given", () => {
    const runner = fakeRunner(statusOf({ enrolled: true }));
    const { Mutation } = resolversOf(
      createPortleSubgraph({ api: apiOf(), runner }),
    );
    Mutation.portleConfigure(undefined, { listenHttps: 8443 }, ctxOf(ADMIN));
    Mutation.portleConfigure(
      undefined,
      { listenHttps: 8443, listenHttp: 8080 },
      ctxOf(ADMIN),
    );
    Mutation.portleConfigure(undefined, {}, ctxOf(ADMIN));
    expect(runner.calls).toEqual([
      'configure {"listen":{"https":8443,"http":80}}',
      'configure {"listen":{"https":8443,"http":8080}}',
      "configure {}",
    ]);
  });
});

describe("portle subgraph: host header rewrite", () => {
  it("portleConfigure passes the flag through and the status reports it, defaulting to false", async () => {
    const runner = fakeRunner(
      statusOf({
        enrolled: true,
        settings: {
          controlPlaneUrl: "c",
          appUpstream: "x",
          upstreams: {},
          dns01Mode: "rfc2136",
          listen: { https: 443, http: 80 },
          autostart: false,
        },
      }),
    );
    const { Query, Mutation } = resolversOf(
      createPortleSubgraph({ api: apiOf(), runner }),
    );
    Mutation.portleConfigure(
      undefined,
      { rewriteHostHeader: true },
      ctxOf(ADMIN),
    );
    Mutation.portleConfigure(
      undefined,
      { rewriteHostHeader: null },
      ctxOf(ADMIN),
    );
    expect(runner.calls).toEqual([
      'configure {"rewriteHostHeader":true}',
      "configure {}",
    ]);
    const status = (await Query.portleStatus(
      undefined,
      {},
      ctxOf(ADMIN),
    )) as ReturnType<typeof toWireStatus>;
    expect(status.settings?.rewriteHostHeader).toBe(false);
  });
});
