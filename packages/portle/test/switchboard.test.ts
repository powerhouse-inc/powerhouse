import type { ISubgraph } from "@powerhousedao/reactor-api";
import { describe, expect, it, vi } from "vitest";
import plugin, {
  createPortlePlugin,
  PORTLE_PLUGIN_NAME,
  portleSwitchboardPlugin,
  type PortleHostContext,
} from "../src/switchboard.js";
import { apiOf, fakeRunner, statusOf } from "./fixtures.js";

function hostContext(
  policy: "OPEN" | "ADMIN_ONLY" = "ADMIN_ONLY",
  requireAuthenticatedCaller = true,
) {
  const registered: ISubgraph[] = [];
  const warnings: string[] = [];
  const infos: string[] = [];
  const ctx: PortleHostContext & {
    registered: ISubgraph[];
    warnings: string[];
    infos: string[];
  } = {
    registered,
    warnings,
    infos,
    options: { configFile: "/p/powerhouse.config.json" },
    logger: {
      info: (m: string) => infos.push(m),
      warn: (m: string) => warnings.push(m),
    },
    api: apiOf({ policy, requireAuthenticatedCaller }),
    graphqlManager: {
      registerSubgraphInstance: vi.fn((subgraph: ISubgraph) => {
        registered.push(subgraph);
        return Promise.resolve();
      }),
    },
    lateSubgraphs: [],
  };
  return ctx;
}

describe("portle switchboard plugin", () => {
  it("is the default export, applies to the switchboard and takes no config", () => {
    expect(plugin).toBe(portleSwitchboardPlugin);
    expect(plugin.name).toBe(PORTLE_PLUGIN_NAME);
    expect(plugin.appliesTo).toBe("switchboard");
    expect(plugin.configSchema).toBeUndefined();
  });

  it("builds the runner on the project's .ph/portle and registers the subgraph late", async () => {
    const ctx = hostContext();
    const stateDirs: string[] = [];
    const runner = fakeRunner();
    const p = createPortlePlugin((stateDir) => {
      stateDirs.push(stateDir);
      return runner;
    });
    await p.hooks!.onSubgraphsRegistering!(ctx);
    expect(stateDirs).toEqual([
      expect.stringMatching(/[\\/]p[\\/]\.ph[\\/]portle$/),
    ]);
    expect(ctx.portle?.runner).toBe(runner);
    expect(ctx.registered.map((s) => s.name)).toEqual(["portle"]);
    expect(ctx.lateSubgraphs).toHaveLength(1);
  });

  describe("the public-config route at onHttpMounting", () => {
    const mounted = (ctx: PortleHostContext) => {
      const mount = vi.fn();
      ctx.api = { ...(ctx.api as object), httpAdapter: { mount } };
      return mount;
    };

    it("mounts it on the adapter, builds the runner once, and answers from the runner's source", async () => {
      const ctx = hostContext();
      const mount = mounted(ctx);
      const runner = fakeRunner();
      const built: string[] = [];
      const p = createPortlePlugin((stateDir) => {
        built.push(stateDir);
        return runner;
      });
      await p.hooks!.onHttpMounting!(ctx);
      await p.hooks!.onSubgraphsRegistering!(ctx);
      expect(built).toHaveLength(1);
      expect(ctx.portle?.runner).toBe(runner);
      expect(mount).toHaveBeenCalledWith(
        "/portle/public/powerhouse.config.json",
        expect.any(Function),
      );
      const handler = mount.mock.calls[0][1] as (
        request: Request,
      ) => Promise<Response>;
      const ask = () =>
        handler(new Request("http://sb/portle/public/powerhouse.config.json"));
      expect((await ask()).status).toBe(404);
      runner.source_ = {
        appUrl: "http://127.0.0.1:1",
        apiPort: "7540",
        publicOrigin: "https://app.dev.sektar.be",
      };
      const refused = await ask();
      expect(refused.status).toBe(502);
      expect(ctx.warnings.at(-1)).toMatch(/public runtime config unavailable/);
    });

    it("names what is missing when the host hands no HTTP adapter", async () => {
      const ctx = hostContext();
      await expect(plugin.hooks!.onHttpMounting!(ctx)).rejects.toThrow(
        /HTTP adapter/,
      );
    });
  });

  it("names what is missing when the host hands no API or manager", async () => {
    const ctx = hostContext();
    delete ctx.api;
    await expect(plugin.hooks!.onSubgraphsRegistering!(ctx)).rejects.toThrow(
      /API and GraphQL manager/,
    );
  });

  describe("autostart at onDrivesReady", () => {
    const enrolledWantingStart = () =>
      statusOf({
        enrolled: true,
        siteZone: "dev.sektar.be",
        settings: {
          controlPlaneUrl: "https://cp",
          appUpstream: "x:1",
          upstreams: {},
          dns01Mode: "rfc2136",
          listen: { https: 443, http: 80 },
          autostart: true,
        },
      });

    it("starts the tunnel when the operator asked and the host passes the gate", async () => {
      const ctx = hostContext();
      const runner = fakeRunner(enrolledWantingStart());
      const p = createPortlePlugin(() => runner);
      await p.hooks!.onSubgraphsRegistering!(ctx);
      await p.hooks!.onDrivesReady!(ctx);
      expect(runner.calls).toEqual(["start"]);
      expect(ctx.infos.at(-1)).toMatch(/tunnel up for dev\.sektar\.be/);
    });

    it("stays down, with a warning, when the host no longer passes the gate", async () => {
      const ctx = hostContext("OPEN");
      const runner = fakeRunner(enrolledWantingStart());
      const p = createPortlePlugin(() => runner);
      await p.hooks!.onSubgraphsRegistering!(ctx);
      await p.hooks!.onDrivesReady!(ctx);
      expect(runner.calls).toEqual([]);
      expect(ctx.warnings.at(-1)).toMatch(
        /no longer passes the publication gate/,
      );
    });

    it("does nothing when not enrolled or when autostart is off", async () => {
      const ctx = hostContext();
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
      const p = createPortlePlugin(() => runner);
      await p.hooks!.onSubgraphsRegistering!(ctx);
      await p.hooks!.onDrivesReady!(ctx);
      expect(runner.calls).toEqual([]);
    });

    it("warns instead of failing the boot when the start throws", async () => {
      const ctx = hostContext();
      const runner = fakeRunner(enrolledWantingStart());
      runner.start = () =>
        Promise.reject(new Error("frpc and caddy not found"));
      const p = createPortlePlugin(() => runner);
      await p.hooks!.onSubgraphsRegistering!(ctx);
      await expect(p.hooks!.onDrivesReady!(ctx)).resolves.toBeUndefined();
      expect(ctx.warnings.at(-1)).toMatch(
        /could not start: frpc and caddy not found/,
      );
    });
  });

  it("stops a running tunnel at shutdown and keeps autostart as the operator left it", async () => {
    const ctx = hostContext();
    const runner = fakeRunner(
      statusOf({
        enrolled: true,
        settings: {
          controlPlaneUrl: "c",
          appUpstream: "x",
          upstreams: {},
          dns01Mode: "rfc2136",
          listen: { https: 443, http: 80 },
          autostart: true,
        },
        tunnel: { state: "up", frpc: null, caddy: null },
      }),
    );
    const p = createPortlePlugin(() => runner);
    await p.hooks!.onSubgraphsRegistering!(ctx);
    await p.hooks!.onShutdown!(ctx);
    expect(runner.calls).toEqual(["stop keepAutostart"]);

    const down = fakeRunner(statusOf({ enrolled: true }));
    const q = createPortlePlugin(() => down);
    const ctx2 = hostContext();
    await q.hooks!.onSubgraphsRegistering!(ctx2);
    await q.hooks!.onShutdown!(ctx2);
    expect(down.calls).toEqual([]);
  });
});
