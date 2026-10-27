import type { ISubgraph } from "@powerhousedao/reactor-api";
import { describe, expect, it, vi } from "vitest";
import plugin, {
  PORTLE_PLUGIN_NAME,
  portleSwitchboardPlugin,
  type PortleHostContext,
} from "../src/switchboard.js";

function hostContext(): PortleHostContext & {
  registered: ISubgraph[];
} {
  const registered: ISubgraph[] = [];
  return {
    registered,
    api: {
      authorizationService: {
        config: {
          policy: "ADMIN_ONLY",
          admins: ["0xa"],
          defaultProtection: false,
        },
      },
      authService: {},
      requireAuthenticatedCaller: true,
      relationalDb: {},
    },
    graphqlManager: {
      registerSubgraphInstance: vi.fn((subgraph: ISubgraph) => {
        registered.push(subgraph);
        return Promise.resolve();
      }),
    },
    lateSubgraphs: [],
  };
}

describe("portle switchboard plugin", () => {
  it("is the default export, applies to the switchboard and takes no config", () => {
    expect(plugin).toBe(portleSwitchboardPlugin);
    expect(plugin.name).toBe(PORTLE_PLUGIN_NAME);
    expect(plugin.appliesTo).toBe("switchboard");
    expect(plugin.configSchema).toBeUndefined();
  });

  it("registers the portle subgraph as a late registration", async () => {
    const ctx = hostContext();
    await plugin.hooks!.onSubgraphsRegistering!(ctx);
    expect(ctx.registered.map((s) => s.name)).toEqual(["portle"]);
    expect(ctx.lateSubgraphs).toHaveLength(1);
    const register = (
      ctx.graphqlManager as {
        registerSubgraphInstance: ReturnType<typeof vi.fn>;
      }
    ).registerSubgraphInstance;
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ name: "portle" }),
      "graphql",
      false,
    );
  });

  it("creates the late-registration list when the host passed none", async () => {
    const ctx = hostContext();
    delete ctx.lateSubgraphs;
    await plugin.hooks!.onSubgraphsRegistering!(ctx);
    expect(ctx.lateSubgraphs).toHaveLength(1);
  });

  it("names what is missing when the host hands no API or manager", async () => {
    const ctx = hostContext();
    delete ctx.api;
    await expect(plugin.hooks!.onSubgraphsRegistering!(ctx)).rejects.toThrow(
      /API and GraphQL manager/,
    );
  });
});
