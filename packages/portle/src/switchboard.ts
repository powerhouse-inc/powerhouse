import type { HostPlugin } from "@powerhousedao/host-core";
import type { ISubgraph } from "@powerhousedao/reactor-api";
import { createPortleSubgraph, type PortleApi } from "./subgraph.js";

/**
 * Portle, server side: the host plugin that lets a project publish itself
 * through the Portle relay. Listed in the project's switchboard host file
 * (`runner.plugins`); presence is activation, and it takes no config.
 *
 * Today it mounts the `portle` subgraph, whose `portleReadiness` query reports
 * the publication gate check by check (see `gate.ts`). The tunnel itself
 * (enrolment, frpc and Caddy under supervision) follows in later work and
 * hangs off the same plugin, so the gate and the thing it guards share one
 * owner.
 */

/**
 * The slice of the switchboard's plugin context this plugin reads. The
 * switchboard does not export its context type; these are the fields it
 * documents as set by the time `onSubgraphsRegistering` fires.
 */
export interface PortleHostContext {
  api?: unknown;
  graphqlManager?: unknown;
  /** Late subgraph registrations drain before the readiness router update. */
  lateSubgraphs?: Promise<unknown>[];
}

interface SubgraphRegistry {
  registerSubgraphInstance(
    subgraph: ISubgraph,
    supergraph?: string,
    core?: boolean,
  ): Promise<unknown>;
}

export interface PortleHooks {
  onSubgraphsRegistering: (ctx: PortleHostContext) => Promise<void>;
}

export const PORTLE_PLUGIN_NAME = "portle";

export const portleSwitchboardPlugin: HostPlugin<PortleHooks> = {
  name: PORTLE_PLUGIN_NAME,
  appliesTo: "switchboard",
  hooks: {
    onSubgraphsRegistering: async (ctx) => {
      const api = ctx.api as PortleApi | undefined;
      const registry = ctx.graphqlManager as SubgraphRegistry | undefined;
      if (!api || !registry) {
        throw new Error(
          "The portle plugin needs the switchboard's API and GraphQL manager at onSubgraphsRegistering; the host handed neither.",
        );
      }
      const registration = registry.registerSubgraphInstance(
        createPortleSubgraph(api),
        "graphql",
        false,
      );
      (ctx.lateSubgraphs ??= []).push(registration);
      await Promise.resolve();
    },
  },
};

// resolveHostPlugins consumes the DEFAULT export (plugin object or factory).
export default portleSwitchboardPlugin;
